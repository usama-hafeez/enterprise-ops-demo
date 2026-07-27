import { DbExecutor } from '../db/executor';
import { InstrumentedExecutor, QueryStats } from '../db/instrumented';
import { runNaivePipeline } from './naive.pipeline';
import { runOptimizedPipeline } from './optimized.pipeline';
import { PipelineRunResult, Variant } from './types';

/**
 * Runs one variant with shared instrumentation: every statement counted,
 * wall-clock measured around the whole run. Peak memory is tracked by the
 * caller (Node samples RSS; the browser demo reports what it can).
 */
export async function runPipeline(
  variant: Variant,
  rawDb: DbExecutor,
  opts: { now?: string } = {},
): Promise<PipelineRunResult> {
  const stats = new QueryStats();
  const db = new InstrumentedExecutor(rawDb, stats);
  const start = Date.now();
  const output =
    variant === 'naive' ? await runNaivePipeline(db, opts) : await runOptimizedPipeline(db, opts);
  const wallMs = Date.now() - start;
  return { variant, ...output, queries: stats.queries, wallMs };
}
