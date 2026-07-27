import { DbExecutor } from '../db/executor';
import { ALLOCATION_ORDER, StockCandidate, planAllocation } from '../allocation/allocation.service';
import { OpenInvoice, SETTLEMENT_ORDER, computeFifo } from '../settlement/settlement.service';
import { insertMany } from '../seed/generator';
import { OutputHasher } from './hash';
import { RUN_TS, invoiceNumberForRequisition, ph } from './common';
import { PipelineOutput, emptyTotals } from './types';

const REQUISITION_BATCH = 50;
const PAYMENT_BATCH = 200;

interface ReqRow {
  id: number;
  customerId: number;
}

interface LineRow {
  id: number;
  requisitionId: number;
  productId: number;
  qtyRequested: number;
}

interface CandidateRow extends StockCandidate {
  productId: number;
}

interface PaymentRow {
  id: number;
  customerId: number;
  amountCents: number;
}

interface InvoiceRow extends OpenInvoice {
  customerId: number;
}

/**
 * Keyset-paginated batches: each batch is one indexed query, no OFFSET scans,
 * and only one batch is ever in memory - this is the generator-based
 * streaming half of the optimization.
 */
async function* batches<T extends { id: number }>(
  fetch: (afterId: number) => Promise<T[]>,
): AsyncGenerator<T[]> {
  let afterId = 0;
  for (;;) {
    const rows = await fetch(afterId);
    if (rows.length === 0) return;
    yield rows;
    const last = rows[rows.length - 1];
    if (!last) return;
    afterId = last.id;
  }
}

/**
 * The optimized variant. Identical business rules to the naive pipeline -
 * allocation and FIFO math go through the same planAllocation/computeFifo
 * functions - but reads are batched IN()/JOIN queries, iteration is
 * generator-based so only one batch lives in memory, and writes are
 * multi-row INSERTs and CASE updates.
 */
export async function runOptimizedPipeline(
  db: DbExecutor,
  opts: { now?: string } = {},
): Promise<PipelineOutput> {
  const now = opts.now ?? RUN_TS;
  const hasher = new OutputHasher();
  const totals = emptyTotals();

  // Phase 1: allocation and invoicing, one transaction per requisition batch.
  const reqBatches = batches<ReqRow>((afterId) =>
    db.query<ReqRow>(
      "SELECT id AS id, customer_id AS customerId FROM requisitions WHERE status = 'pending' AND id > ? ORDER BY id LIMIT " +
        REQUISITION_BATCH,
      [afterId],
    ),
  );

  for await (const reqBatch of reqBatches) {
    await db.transaction(async (tx) => {
      const reqIds = reqBatch.map((r) => r.id);
      const lines = await tx.query<LineRow>(
        `SELECT id AS id, requisition_id AS requisitionId, product_id AS productId, qty_requested AS qtyRequested
           FROM requisition_lines
          WHERE requisition_id IN (${ph(reqIds)})
          ORDER BY id`,
        reqIds,
      );

      // One locked read for every candidate stock row the whole batch needs.
      const productIds = [...new Set(lines.map((l) => l.productId))];
      const lockClause = tx.dialect === 'mysql' ? ' FOR UPDATE OF s' : '';
      const candidates =
        productIds.length === 0
          ? []
          : await tx.query<CandidateRow>(
              `SELECT s.id AS id, s.product_id AS productId, s.warehouse_id AS warehouseId,
                      s.qty_on_hand AS qtyOnHand, s.unit_cost_cents AS unitCostCents
                 FROM stock s
                 JOIN warehouses w ON w.id = s.warehouse_id
                WHERE s.product_id IN (${ph(productIds)}) AND s.qty_on_hand > 0
                ORDER BY ${ALLOCATION_ORDER}${lockClause}`,
              productIds,
            );
      const byProduct = new Map<number, CandidateRow[]>();
      for (const c of candidates) {
        const list = byProduct.get(c.productId);
        if (list) list.push(c);
        else byProduct.set(c.productId, [c]);
      }

      // Allocate in memory, in the same line order the naive variant uses.
      // Candidate quantities are mutated as lines consume them, so two lines
      // wanting the same stock row see exactly what sequential per-line
      // processing would have seen.
      const stockDelta = new Map<number, number>();
      const allocationRows: unknown[][] = [];
      const lineAllocated = new Map<number, number>();
      const backorderRows: unknown[][] = [];
      const reqAgg = new Map<number, { allocated: boolean; backordered: boolean; totalCents: number }>();
      for (const req of reqBatch) {
        reqAgg.set(req.id, { allocated: false, backordered: false, totalCents: 0 });
      }

      for (const line of lines) {
        const cands = byProduct.get(line.productId) ?? [];
        const plan = planAllocation(cands, line.qtyRequested);
        const agg = reqAgg.get(line.requisitionId);
        for (const take of plan.takes) {
          const cand = cands.find((c) => c.id === take.stockId);
          if (cand) cand.qtyOnHand -= take.qty;
          stockDelta.set(take.stockId, (stockDelta.get(take.stockId) ?? 0) + take.qty);
          allocationRows.push([line.id, take.stockId, take.qty, take.unitCostCents, now]);
          hasher.add(['alloc', line.id, take.stockId, take.qty]);
          totals.allocations += 1;
          if (agg) {
            agg.allocated = true;
            agg.totalCents += take.qty * take.unitCostCents;
          }
        }
        if (plan.takes.length > 0) {
          lineAllocated.set(line.id, line.qtyRequested - plan.backorderQty);
        }
        if (plan.backorderQty > 0) {
          backorderRows.push([line.id, plan.backorderQty, 'open']);
          hasher.add(['bo', line.id, plan.backorderQty]);
          totals.backorders += 1;
          if (agg) agg.backordered = true;
        }
        totals.lines += 1;
      }

      // Batched writes: one CASE update per table, multi-row INSERTs.
      if (stockDelta.size > 0) {
        const ids = [...stockDelta.keys()];
        const cases = ids.map(() => 'WHEN ? THEN ?').join(' ');
        await tx.run(
          `UPDATE stock SET qty_on_hand = qty_on_hand - CASE id ${cases} END WHERE id IN (${ph(ids)})`,
          [...ids.flatMap((id) => [id, stockDelta.get(id) ?? 0]), ...ids],
        );
      }
      if (allocationRows.length > 0) {
        await insertMany(
          tx,
          'allocations',
          ['requisition_line_id', 'stock_id', 'qty', 'unit_cost_cents', 'created_at'],
          allocationRows,
        );
      }
      if (lineAllocated.size > 0) {
        const ids = [...lineAllocated.keys()];
        const cases = ids.map(() => 'WHEN ? THEN ?').join(' ');
        await tx.run(
          `UPDATE requisition_lines SET qty_allocated = qty_allocated + CASE id ${cases} END WHERE id IN (${ph(ids)})`,
          [...ids.flatMap((id) => [id, lineAllocated.get(id) ?? 0]), ...ids],
        );
      }
      if (backorderRows.length > 0) {
        await insertMany(tx, 'backorders', ['requisition_line_id', 'qty', 'status'], backorderRows);
      }

      const invoiceRows: unknown[][] = [];
      const invoicedIds: number[] = [];
      const backorderedIds: number[] = [];
      for (const req of reqBatch) {
        const agg = reqAgg.get(req.id);
        if (!agg) continue;
        if (agg.allocated) {
          invoiceRows.push([
            invoiceNumberForRequisition(req.id),
            req.customerId,
            req.id,
            agg.totalCents,
            0,
            'open',
            now,
          ]);
          invoicedIds.push(req.id);
          hasher.add(['inv', req.id, agg.totalCents]);
          totals.invoicesCreated += 1;
        } else {
          backorderedIds.push(req.id);
        }
        totals.requisitions += 1;
      }
      if (invoiceRows.length > 0) {
        await insertMany(
          tx,
          'invoices',
          ['number', 'customer_id', 'requisition_id', 'total_cents', 'amount_paid_cents', 'status', 'issued_at'],
          invoiceRows,
        );
        await tx.run(
          `UPDATE requisitions SET status = 'invoiced' WHERE id IN (${ph(invoicedIds)})`,
          invoicedIds,
        );
      }
      if (backorderedIds.length > 0) {
        await tx.run(
          `UPDATE requisitions SET status = 'backordered' WHERE id IN (${ph(backorderedIds)})`,
          backorderedIds,
        );
      }
    });
  }

  // Phase 2: settlement, one transaction per payment batch. All outstanding
  // invoices for the batch's customers arrive in one query; FIFO runs in
  // memory against that state, then writes go back batched.
  const paymentBatches = batches<PaymentRow>((afterId) =>
    db.query<PaymentRow>(
      'SELECT id AS id, customer_id AS customerId, amount_cents AS amountCents FROM payments WHERE id > ? ORDER BY id LIMIT ' +
        PAYMENT_BATCH,
      [afterId],
    ),
  );

  for await (const paymentBatch of paymentBatches) {
    await db.transaction(async (tx) => {
      const customerIds = [...new Set(paymentBatch.map((p) => p.customerId))];
      const lockClause = tx.dialect === 'mysql' ? ' FOR UPDATE' : '';
      const invoices = await tx.query<InvoiceRow>(
        `SELECT id AS id, customer_id AS customerId, total_cents AS totalCents, amount_paid_cents AS amountPaidCents
           FROM invoices
          WHERE customer_id IN (${ph(customerIds)}) AND status IN ('open', 'partial')
          ORDER BY customer_id, ${SETTLEMENT_ORDER}${lockClause}`,
        customerIds,
      );
      const byCustomer = new Map<number, InvoiceRow[]>();
      for (const inv of invoices) {
        const list = byCustomer.get(inv.customerId);
        if (list) list.push(inv);
        else byCustomer.set(inv.customerId, [inv]);
      }

      const appRows: unknown[][] = [];
      const creditRows: unknown[][] = [];
      const touched = new Map<number, InvoiceRow>();

      for (const payment of paymentBatch) {
        const list = byCustomer.get(payment.customerId) ?? [];
        const result = computeFifo(list, payment.amountCents);
        for (const app of result.applications) {
          const inv = list.find((i) => i.id === app.invoiceId);
          if (inv) {
            inv.amountPaidCents += app.amountCents;
            touched.set(inv.id, inv);
          }
          appRows.push([payment.id, app.invoiceId, app.amountCents]);
          hasher.add(['pay', payment.id, app.invoiceId, app.amountCents]);
          totals.applications += 1;
        }
        if (result.creditCents > 0) {
          creditRows.push([payment.customerId, payment.id, result.creditCents, now]);
          hasher.add(['credit', payment.id, result.creditCents]);
          totals.credits += 1;
        }
        totals.payments += 1;
      }

      if (appRows.length > 0) {
        await insertMany(tx, 'payment_applications', ['payment_id', 'invoice_id', 'amount_cents'], appRows);
      }
      if (touched.size > 0) {
        const ids = [...touched.keys()];
        const paidCases = ids.map(() => 'WHEN ? THEN ?').join(' ');
        const statusCases = ids.map(() => 'WHEN ? THEN ?').join(' ');
        const paidParams = ids.flatMap((id) => [id, touched.get(id)?.amountPaidCents ?? 0]);
        const statusParams = ids.flatMap((id) => {
          const inv = touched.get(id);
          return [id, inv && inv.amountPaidCents >= inv.totalCents ? 'paid' : 'partial'];
        });
        await tx.run(
          `UPDATE invoices SET amount_paid_cents = CASE id ${paidCases} END, status = CASE id ${statusCases} END WHERE id IN (${ph(ids)})`,
          [...paidParams, ...statusParams, ...ids],
        );
      }
      if (creditRows.length > 0) {
        await insertMany(
          tx,
          'credit_ledger',
          ['customer_id', 'payment_id', 'amount_cents', 'created_at'],
          creditRows,
        );
      }
    });
  }

  return { totals, outputHash: hasher.digest() };
}
