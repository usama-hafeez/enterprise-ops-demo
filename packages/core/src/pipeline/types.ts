export type Variant = 'naive' | 'optimized';

export interface PipelineTotals {
  requisitions: number;
  lines: number;
  allocations: number;
  backorders: number;
  invoicesCreated: number;
  payments: number;
  applications: number;
  credits: number;
}

export interface PipelineOutput {
  totals: PipelineTotals;
  /** Hash over every allocation, backorder, invoice, application, and credit
   *  the run produced - the two variants must land on the same value. */
  outputHash: string;
}

export interface PipelineRunResult extends PipelineOutput {
  variant: Variant;
  queries: number;
  wallMs: number;
}

export function emptyTotals(): PipelineTotals {
  return {
    requisitions: 0,
    lines: 0,
    allocations: 0,
    backorders: 0,
    invoicesCreated: 0,
    payments: 0,
    applications: 0,
    credits: 0,
  };
}
