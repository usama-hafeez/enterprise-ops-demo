/// <reference lib="webworker" />
import {
  DbExecutor,
  Dialect,
  SqlJsExecutor,
  StatementResult,
  createCompositeIndexes,
  runPipeline,
} from '@enterprise-ops/core';
import { RunRequest, WorkerMessage } from './messages';

const post = (msg: WorkerMessage) => postMessage(msg);

/**
 * Thin pass-through that reports roughly every 100 ms so the page can show a
 * live query counter. sql.js is synchronous, so this worker thread is busy
 * for the whole run - postMessage still queues fine. The precise final
 * counts come from runPipeline's own instrumentation, not from this.
 */
class ReportingExecutor implements DbExecutor {
  readonly dialect: Dialect;
  private queries = 0;
  private lastReport = 0;
  private readonly startedAt = Date.now();

  constructor(private readonly inner: DbExecutor) {
    this.dialect = inner.dialect;
  }

  private tick(): void {
    this.queries++;
    const now = Date.now();
    if (now - this.lastReport >= 100) {
      this.lastReport = now;
      post({ type: 'progress', queries: this.queries, elapsedMs: now - this.startedAt });
    }
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    this.tick();
    return this.inner.query<T>(sql, params);
  }

  run(sql: string, params?: unknown[]): Promise<StatementResult> {
    this.tick();
    return this.inner.run(sql, params);
  }

  async *iterate<T = Record<string, unknown>>(sql: string, params?: unknown[]): AsyncIterable<T> {
    this.tick();
    yield* this.inner.iterate<T>(sql, params);
  }

  transaction<R>(fn: (tx: DbExecutor) => Promise<R>): Promise<R> {
    return this.inner.transaction(() => fn(this));
  }
}

addEventListener('message', async (event: MessageEvent<RunRequest>) => {
  const { variant, seed } = event.data;
  try {
    const db = await SqlJsExecutor.create(new Uint8Array(seed), {
      locateFile: (file) => new URL(file, self.location.href).toString(),
    });
    // The seed is baked without the composite indexes; the optimized variant
    // is defined as running with them.
    if (variant === 'optimized') {
      await createCompositeIndexes(db);
    }
    const result = await runPipeline(variant, new ReportingExecutor(db));
    post({
      type: 'done',
      result: {
        queries: result.queries,
        wallMs: result.wallMs,
        totals: result.totals,
        outputHash: result.outputHash,
      },
    });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
