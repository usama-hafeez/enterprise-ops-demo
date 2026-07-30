import { PipelineTotals, Variant } from '@enterprise-ops/core';

/** Worker input: run one variant against a copy of the baked seed database. */
export interface RunRequest {
  variant: Variant;
  seed: ArrayBuffer;
}

export interface RunResultPayload {
  queries: number;
  wallMs: number;
  totals: PipelineTotals;
  outputHash: string;
}

export type WorkerMessage =
  | { type: 'progress'; queries: number; elapsedMs: number }
  | { type: 'done'; result: RunResultPayload }
  | { type: 'error'; message: string };
