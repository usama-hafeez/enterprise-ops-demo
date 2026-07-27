import { SqlJsExecutor } from '../db/sqljs-executor';
import { applySchema } from '../db/schema';
import { OpenInvoice, computeFifo, settlePayment } from './settlement.service';

describe('computeFifo (table-driven)', () => {
  const inv = (id: number, totalCents: number, amountPaidCents = 0): OpenInvoice => ({
    id,
    totalCents,
    amountPaidCents,
  });

  const cases = [
    {
      name: 'exact payment settles one invoice in full',
      invoices: [inv(1, 10_000)],
      amount: 10_000,
      expected: { applications: [{ invoiceId: 1, amountCents: 10_000 }], creditCents: 0 },
    },
    {
      name: 'partial payment applies to the oldest invoice',
      invoices: [inv(1, 10_000)],
      amount: 4_000,
      expected: { applications: [{ invoiceId: 1, amountCents: 4_000 }], creditCents: 0 },
    },
    {
      name: 'payment spans invoices oldest-first',
      invoices: [inv(1, 5_000), inv(2, 5_000), inv(3, 5_000)],
      amount: 7_000,
      expected: {
        applications: [
          { invoiceId: 1, amountCents: 5_000 },
          { invoiceId: 2, amountCents: 2_000 },
        ],
        creditCents: 0,
      },
    },
    {
      name: 'overpayment becomes credit',
      invoices: [inv(1, 10_000)],
      amount: 12_500,
      expected: { applications: [{ invoiceId: 1, amountCents: 10_000 }], creditCents: 2_500 },
    },
    {
      name: 'no outstanding invoices - whole payment becomes credit',
      invoices: [],
      amount: 9_900,
      expected: { applications: [], creditCents: 9_900 },
    },
    {
      name: 'partially-paid invoice only absorbs its remainder',
      invoices: [inv(1, 10_000, 6_000)],
      amount: 5_000,
      expected: { applications: [{ invoiceId: 1, amountCents: 4_000 }], creditCents: 1_000 },
    },
    {
      name: 'already-settled invoice in the list is skipped',
      invoices: [inv(1, 10_000, 10_000), inv(2, 3_000)],
      amount: 2_000,
      expected: { applications: [{ invoiceId: 2, amountCents: 2_000 }], creditCents: 0 },
    },
    {
      name: 'zero-amount payment does nothing',
      invoices: [inv(1, 10_000)],
      amount: 0,
      expected: { applications: [], creditCents: 0 },
    },
  ];

  it.each(cases)('$name', ({ invoices, amount, expected }) => {
    expect(computeFifo(invoices, amount)).toEqual(expected);
  });
});

describe('settlePayment against a real (SQLite) database', () => {
  let db: SqlJsExecutor;

  beforeEach(async () => {
    db = await SqlJsExecutor.create();
    await applySchema(db);
    await db.run(
      'INSERT INTO customers (name, email) VALUES ' +
        "('Customer 0001', 'customer0001@acme-parts.test'), ('Customer 0002', 'customer0002@acme-parts.test')",
    );
    // Insert order deliberately scrambles id vs issued_at - FIFO must follow
    // issued_at, not insertion order.
    await db.run(
      'INSERT INTO invoices (number, customer_id, total_cents, amount_paid_cents, status, issued_at) VALUES ' +
        "('INV-000003', 1, 5000, 0, 'open', '2026-03-01 00:00:00'), " + // id 1, newest
        "('INV-000001', 1, 10000, 4000, 'partial', '2026-01-01 00:00:00'), " + // id 2, oldest
        "('INV-000002', 1, 8000, 0, 'open', '2026-02-01 00:00:00'), " + // id 3, middle
        "('INV-000099', 2, 7000, 0, 'open', '2025-01-01 00:00:00')", // id 4, other customer
    );
  });

  afterEach(() => {
    db.db.close();
  });

  it('applies oldest-first by issued_at, updates statuses, only for the paying customer', async () => {
    await db.run(
      "INSERT INTO payments (customer_id, amount_cents, received_at) VALUES (1, 15000, '2026-07-01 00:00:00')",
    );

    const outcome = await settlePayment(db, { id: 1, customerId: 1, amountCents: 15_000 });

    expect(outcome.applications).toEqual([
      { invoiceId: 2, amountCents: 6_000 },
      { invoiceId: 3, amountCents: 8_000 },
      { invoiceId: 1, amountCents: 1_000 },
    ]);
    expect(outcome.creditCents).toBe(0);

    const invoices = await db.query('SELECT id, amount_paid_cents, status FROM invoices ORDER BY id');
    expect(invoices).toEqual([
      { id: 1, amount_paid_cents: 1000, status: 'partial' },
      { id: 2, amount_paid_cents: 10000, status: 'paid' },
      { id: 3, amount_paid_cents: 8000, status: 'paid' },
      { id: 4, amount_paid_cents: 0, status: 'open' },
    ]);

    const credits = await db.query('SELECT id FROM credit_ledger');
    expect(credits).toEqual([]);
  });

  it('books the overpayment remainder to the credit ledger', async () => {
    await db.run(
      "INSERT INTO payments (customer_id, amount_cents, received_at) VALUES (1, 30000, '2026-07-01 00:00:00')",
    );

    const outcome = await settlePayment(db, { id: 1, customerId: 1, amountCents: 30_000 });

    // Outstanding: 6000 + 8000 + 5000 = 19000; the rest is credit.
    expect(outcome.creditCents).toBe(11_000);

    const credits = await db.query('SELECT customer_id, payment_id, amount_cents FROM credit_ledger');
    expect(credits).toEqual([{ customer_id: 1, payment_id: 1, amount_cents: 11_000 }]);
  });
});
