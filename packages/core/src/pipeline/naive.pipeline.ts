import { DbExecutor } from '../db/executor';
import { allocateLine } from '../allocation/allocation.service';
import { settlePayment } from '../settlement/settlement.service';
import { OutputHasher } from './hash';
import { RUN_TS, invoiceNumberForRequisition, requisitionStatus } from './common';
import { PipelineOutput, emptyTotals } from './types';

interface RequisitionRow {
  id: number;
  customer_id: number;
  [key: string]: unknown;
}

interface LineRow {
  id: number;
  product_id: number;
  qty_requested: number;
  [key: string]: unknown;
}

interface PaymentRow {
  id: number;
  customer_id: number;
  amount_cents: number;
  [key: string]: unknown;
}

/**
 * The naive variant, written the way this code usually gets written first:
 * load whole result sets with SELECT *, then loop and issue a query (or
 * several) per row. Correct, easy to read, and it degrades linearly in
 * query count as volume grows.
 */
export async function runNaivePipeline(
  db: DbExecutor,
  opts: { now?: string } = {},
): Promise<PipelineOutput> {
  const now = opts.now ?? RUN_TS;
  const hasher = new OutputHasher();
  const totals = emptyTotals();

  // Phase 1: allocation and invoicing.
  // Entire pending set loaded up front, every column, all in memory.
  const requisitions = await db.query<RequisitionRow>(
    "SELECT * FROM requisitions WHERE status = 'pending' ORDER BY id",
  );

  for (const req of requisitions) {
    // One query per requisition to fetch its lines...
    const lines = await db.query<LineRow>(
      'SELECT * FROM requisition_lines WHERE requisition_id = ? ORDER BY id',
      [req.id],
    );

    let anyAllocated = false;
    let anyBackordered = false;
    let invoiceTotalCents = 0;

    for (const line of lines) {
      // ...and a further cluster of queries per line inside allocateLine.
      const outcome = await allocateLine(
        db,
        { id: line.id, productId: line.product_id, qtyRequested: line.qty_requested },
        { now },
      );
      for (const take of outcome.takes) {
        hasher.add(['alloc', line.id, take.stockId, take.qty]);
        invoiceTotalCents += take.qty * take.unitCostCents;
        totals.allocations += 1;
      }
      if (outcome.takes.length > 0) anyAllocated = true;
      if (outcome.backorderQty > 0) {
        hasher.add(['bo', line.id, outcome.backorderQty]);
        totals.backorders += 1;
        anyBackordered = true;
      }
      totals.lines += 1;
    }

    // Two more single-row updates per requisition.
    await db.run('UPDATE requisitions SET status = ? WHERE id = ?', [
      requisitionStatus(anyAllocated, anyBackordered),
      req.id,
    ]);
    if (anyAllocated) {
      await db.run(
        "INSERT INTO invoices (number, customer_id, requisition_id, total_cents, amount_paid_cents, status, issued_at) VALUES (?, ?, ?, ?, 0, 'open', ?)",
        [invoiceNumberForRequisition(req.id), req.customer_id, req.id, invoiceTotalCents, now],
      );
      await db.run("UPDATE requisitions SET status = 'invoiced' WHERE id = ?", [req.id]);
      hasher.add(['inv', req.id, invoiceTotalCents]);
      totals.invoicesCreated += 1;
    }
    totals.requisitions += 1;
  }

  // Phase 2: settlement. Full payment table in memory, then per-payment
  // invoice lookups and per-application writes inside settlePayment.
  const payments = await db.query<PaymentRow>('SELECT * FROM payments ORDER BY id');
  for (const payment of payments) {
    const outcome = await settlePayment(
      db,
      { id: payment.id, customerId: payment.customer_id, amountCents: payment.amount_cents },
      { now },
    );
    for (const app of outcome.applications) {
      hasher.add(['pay', payment.id, app.invoiceId, app.amountCents]);
      totals.applications += 1;
    }
    if (outcome.creditCents > 0) {
      hasher.add(['credit', payment.id, outcome.creditCents]);
      totals.credits += 1;
    }
    totals.payments += 1;
  }

  return { totals, outputHash: hasher.digest() };
}
