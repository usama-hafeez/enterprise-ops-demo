import { DbExecutor } from '../db/executor';

export interface StockCandidate {
  id: number;
  warehouseId: number;
  qtyOnHand: number;
  unitCostCents: number;
}

export interface PlannedTake {
  stockId: number;
  warehouseId: number;
  qty: number;
  unitCostCents: number;
}

export interface AllocationPlan {
  takes: PlannedTake[];
  backorderQty: number;
}

export interface AllocationOutcome extends AllocationPlan {
  requisitionLineId: number;
}

export interface AllocateOptions {
  /**
   * Row-level locking (SELECT ... FOR UPDATE) on the candidate stock rows.
   * On by default; the concurrency test switches it off to demonstrate that
   * without it, parallel allocations oversell the same stock row.
   */
  lock?: boolean;
  /** Timestamp written to allocation rows; injected so runs are reproducible. */
  now?: string;
}

/** Priority stock first, then nearest warehouse, then lowest cost. */
export const ALLOCATION_ORDER =
  's.is_priority DESC, w.distance_km ASC, s.unit_cost_cents ASC, s.id ASC';

/** Pure planning step. Candidates must already be in allocation order. */
export function planAllocation(candidates: StockCandidate[], qtyRequested: number): AllocationPlan {
  const takes: PlannedTake[] = [];
  let remaining = qtyRequested;
  for (const c of candidates) {
    if (remaining <= 0) break;
    if (c.qtyOnHand <= 0) continue;
    const qty = Math.min(remaining, c.qtyOnHand);
    takes.push({ stockId: c.id, warehouseId: c.warehouseId, qty, unitCostCents: c.unitCostCents });
    remaining -= qty;
  }
  return { takes, backorderQty: remaining };
}

/**
 * Allocates one requisition line: locks candidate stock, takes in priority
 * order, records allocations, and backorders any shortfall. Used unchanged
 * by both the naive and the optimized pipeline - what differs between them
 * is how work gets to this point, not what correct allocation means.
 */
export async function allocateLine(
  db: DbExecutor,
  line: { id: number; productId: number; qtyRequested: number },
  opts: AllocateOptions = {},
): Promise<AllocationOutcome> {
  const { lock = true, now = '2026-07-01 00:00:00' } = opts;
  return db.transaction(async (tx) => {
    // FOR UPDATE OF s: lock only the stock rows, not the joined warehouse
    // rows, so parallel allocations of different products never contend on
    // the shared warehouse records. SQLite has one writer; no clause needed.
    const lockClause = lock && tx.dialect === 'mysql' ? ' FOR UPDATE OF s' : '';
    const candidates = await tx.query<StockCandidate>(
      `SELECT s.id AS id, s.warehouse_id AS warehouseId,
              s.qty_on_hand AS qtyOnHand, s.unit_cost_cents AS unitCostCents
         FROM stock s
         JOIN warehouses w ON w.id = s.warehouse_id
        WHERE s.product_id = ? AND s.qty_on_hand > 0
        ORDER BY ${ALLOCATION_ORDER}${lockClause}`,
      [line.productId],
    );

    const plan = planAllocation(candidates, line.qtyRequested);

    for (const take of plan.takes) {
      await tx.run('UPDATE stock SET qty_on_hand = qty_on_hand - ? WHERE id = ?', [
        take.qty,
        take.stockId,
      ]);
      await tx.run(
        'INSERT INTO allocations (requisition_line_id, stock_id, qty, unit_cost_cents, created_at) VALUES (?, ?, ?, ?, ?)',
        [line.id, take.stockId, take.qty, take.unitCostCents, now],
      );
    }

    const allocatedQty = line.qtyRequested - plan.backorderQty;
    if (allocatedQty > 0) {
      await tx.run('UPDATE requisition_lines SET qty_allocated = qty_allocated + ? WHERE id = ?', [
        allocatedQty,
        line.id,
      ]);
    }
    if (plan.backorderQty > 0) {
      await tx.run(
        "INSERT INTO backorders (requisition_line_id, qty, status) VALUES (?, ?, 'open')",
        [line.id, plan.backorderQty],
      );
    }

    return { ...plan, requisitionLineId: line.id };
  });
}
