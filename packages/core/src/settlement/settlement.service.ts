import { DbExecutor } from '../db/executor';

export interface OpenInvoice {
  id: number;
  totalCents: number;
  amountPaidCents: number;
}

export interface PaymentApplication {
  invoiceId: number;
  amountCents: number;
}

export interface FifoResult {
  applications: PaymentApplication[];
  creditCents: number;
}

export interface SettleOptions {
  lock?: boolean;
  /** Timestamp written to credit ledger rows; injected so runs are reproducible. */
  now?: string;
}

export interface SettlementOutcome extends FifoResult {
  paymentId: number;
}

/** Oldest first; id breaks ties so ordering is total and deterministic. */
export const SETTLEMENT_ORDER = 'issued_at ASC, id ASC';

/**
 * Pure FIFO step: walk outstanding invoices oldest-first, pay each one's
 * remainder until the payment runs out; whatever is left is credit.
 * Invoices must already be in settlement order.
 */
export function computeFifo(invoicesOldestFirst: OpenInvoice[], amountCents: number): FifoResult {
  const applications: PaymentApplication[] = [];
  let remaining = amountCents;
  for (const inv of invoicesOldestFirst) {
    if (remaining <= 0) break;
    const due = inv.totalCents - inv.amountPaidCents;
    if (due <= 0) continue;
    const amount = Math.min(due, remaining);
    applications.push({ invoiceId: inv.id, amountCents: amount });
    remaining -= amount;
  }
  return { applications, creditCents: remaining };
}

/**
 * Settles one payment against the customer's outstanding invoices,
 * oldest-first. Handles partial payment (invoice left 'partial'),
 * overpayment (remainder booked to the credit ledger), and the
 * no-outstanding-invoices case (whole amount becomes credit).
 */
export async function settlePayment(
  db: DbExecutor,
  payment: { id: number; customerId: number; amountCents: number },
  opts: SettleOptions = {},
): Promise<SettlementOutcome> {
  const { lock = true, now = '2026-07-01 00:00:00' } = opts;
  return db.transaction(async (tx) => {
    const lockClause = lock && tx.dialect === 'mysql' ? ' FOR UPDATE' : '';
    const invoices = await tx.query<OpenInvoice>(
      `SELECT id AS id, total_cents AS totalCents, amount_paid_cents AS amountPaidCents
         FROM invoices
        WHERE customer_id = ? AND status IN ('open', 'partial')
        ORDER BY ${SETTLEMENT_ORDER}${lockClause}`,
      [payment.customerId],
    );

    const result = computeFifo(invoices, payment.amountCents);
    const byId = new Map(invoices.map((inv) => [inv.id, inv]));

    for (const app of result.applications) {
      const inv = byId.get(app.invoiceId);
      if (!inv) continue; // computeFifo only returns ids from the list above
      const newPaid = inv.amountPaidCents + app.amountCents;
      const status = newPaid >= inv.totalCents ? 'paid' : 'partial';
      await tx.run(
        'INSERT INTO payment_applications (payment_id, invoice_id, amount_cents) VALUES (?, ?, ?)',
        [payment.id, app.invoiceId, app.amountCents],
      );
      await tx.run('UPDATE invoices SET amount_paid_cents = ?, status = ? WHERE id = ?', [
        newPaid,
        status,
        inv.id,
      ]);
    }

    if (result.creditCents > 0) {
      await tx.run(
        'INSERT INTO credit_ledger (customer_id, payment_id, amount_cents, created_at) VALUES (?, ?, ?, ?)',
        [payment.customerId, payment.id, result.creditCents, now],
      );
    }

    return { ...result, paymentId: payment.id };
  });
}
