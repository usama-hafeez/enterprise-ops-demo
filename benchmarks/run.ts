/**
 * Runs the same pipeline twice against MySQL - naive, then optimized - and
 * prints the comparison table the README quotes, plus benchmarks/results.json.
 *
 * Each variant runs in its own child process. RSS almost never shrinks inside
 * a Node process, so measuring both variants in one process would let the
 * naive run's high-water mark mask the optimized run's real footprint.
 * Parent mode (no args) spawns `node dist/run.js --variant <v>` per variant
 * and each child prints a single JSON line on stdout.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  MemorySampler,
  PipelineRunResult,
  SeedConfig,
  Variant,
  createCompositeIndexes,
  dropCompositeIndexes,
  resetSchema,
  runPipeline,
  seedConfigFrom,
  seedDatabase,
} from '@enterprise-ops/core';
import { MysqlExecutor, createAppPool, env } from '@enterprise-ops/server';

interface VariantResult extends PipelineRunResult {
  peakRssBytes: number;
  mysqlVersion: string;
}

async function runVariant(variant: Variant): Promise<VariantResult> {
  const volumes = seedConfigFrom(process.env);
  const pool = createAppPool();
  const db = new MysqlExecutor(pool);
  try {
    const [row] = await db.query<{ v: string }>('SELECT VERSION() AS v');
    // Fresh canonical schema, then the index state the variant is defined by.
    await resetSchema(db);
    if (variant === 'optimized') {
      await createCompositeIndexes(db);
    } else {
      await dropCompositeIndexes(db);
    }
    await seedDatabase(db, volumes);
    console.error(`[${variant}] seeded, running pipeline...`);

    const sampler = new MemorySampler();
    sampler.start();
    const result = await runPipeline(variant, db);
    const peakRssBytes = sampler.stop();
    console.error(`[${variant}] done in ${(result.wallMs / 1000).toFixed(1)} s`);
    return { ...result, peakRssBytes, mysqlVersion: row?.v ?? 'unknown' };
  } finally {
    await pool.end();
  }
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-GB');
}

function fmtSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function fmtMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function pct(naive: number, optimized: number): string {
  if (naive === 0) return 'n/a';
  const change = ((optimized - naive) / naive) * 100;
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
}

function spawnVariant(variant: Variant): VariantResult {
  const child = spawnSync(process.execPath, [__filename, '--variant', variant], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    env: process.env,
  });
  if (child.status !== 0) {
    throw new Error(`${variant} child exited with status ${child.status}`);
  }
  const lines = child.stdout.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) throw new Error(`${variant} child produced no output`);
  return JSON.parse(last) as VariantResult;
}

function table(volumes: SeedConfig, naive: VariantResult, optimized: VariantResult): string {
  const rows: string[][] = [
    ['variant', 'queries', 'wall clock', 'peak RSS'],
    ['naive', fmtInt(naive.queries), fmtSeconds(naive.wallMs), fmtMb(naive.peakRssBytes)],
    [
      'optimized',
      fmtInt(optimized.queries),
      fmtSeconds(optimized.wallMs),
      fmtMb(optimized.peakRssBytes),
    ],
    [
      'change',
      pct(naive.queries, optimized.queries),
      pct(naive.wallMs, optimized.wallMs),
      pct(naive.peakRssBytes, optimized.peakRssBytes),
    ],
  ];
  const widths = rows[0]!.map((_, col) => Math.max(...rows.map((r) => r[col]!.length)));
  const rendered = rows
    .map((r) => r.map((cell, col) => cell.padEnd(widths[col]! + 2)).join('').trimEnd())
    .join('\n');
  const stockRows = volumes.products * 4;
  return [
    'enterprise-ops-demo benchmark (this machine, this seed volume - not production figures)',
    `MySQL ${naive.mysqlVersion} at ${env.mysql.host}:${env.mysql.port}`,
    `volumes: seed ${volumes.seed}, ${fmtInt(volumes.requisitions)} requisitions, ` +
      `${fmtInt(volumes.products)} products (${fmtInt(stockRows)} stock rows), ` +
      `${fmtInt(volumes.invoices)} invoices, ${fmtInt(volumes.payments)} payments`,
    '',
    rendered,
    '',
    `output hash: ${naive.outputHash === optimized.outputHash ? `${naive.outputHash} (identical)` : 'MISMATCH'}`,
  ].join('\n');
}

async function main(): Promise<void> {
  const variantFlag = process.argv.indexOf('--variant');
  if (variantFlag !== -1) {
    const variant = process.argv[variantFlag + 1] as Variant;
    const result = await runVariant(variant);
    console.log(JSON.stringify(result));
    return;
  }

  const volumes = seedConfigFrom(process.env);
  const naive = spawnVariant('naive');
  const optimized = spawnVariant('optimized');

  console.log('\n' + table(volumes, naive, optimized) + '\n');

  if (naive.outputHash !== optimized.outputHash) {
    console.error('FATAL: the two variants did not produce identical output.');
    process.exitCode = 1;
    return;
  }

  const results = {
    generatedAt: new Date().toISOString(),
    // Present when run by GitHub Actions; null for local runs.
    gitSha: process.env['GITHUB_SHA'] ?? null,
    mysqlVersion: naive.mysqlVersion,
    volumes,
    naive: pick(naive),
    optimized: pick(optimized),
    change: {
      queriesPct: round1(((optimized.queries - naive.queries) / naive.queries) * 100),
      wallPct: round1(((optimized.wallMs - naive.wallMs) / naive.wallMs) * 100),
      peakRssPct: round1(
        ((optimized.peakRssBytes - naive.peakRssBytes) / naive.peakRssBytes) * 100,
      ),
    },
  };
  const out = path.resolve(__dirname, '..', 'results.json');
  fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
  console.log(`wrote ${out}`);
}

function pick(r: VariantResult) {
  return {
    queries: r.queries,
    wallMs: Math.round(r.wallMs),
    peakRssBytes: r.peakRssBytes,
    outputHash: r.outputHash,
    totals: r.totals,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
