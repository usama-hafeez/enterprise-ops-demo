import { SqlJsExecutor } from '../db/sqljs-executor';
import { applySchema, createCompositeIndexes } from '../db/schema';
import { SeedConfig } from '../seed/config';
import { seedDatabase } from '../seed/generator';
import { runPipeline } from './runner';

const volumes: SeedConfig = {
  seed: 1234,
  products: 60,
  customers: 12,
  requisitions: 40,
  maxLinesPerRequisition: 4,
  maxQtyPerLine: 15,
  invoices: 80,
  // Enough payments that some customers' outstanding invoices are fully
  // settled and later payments overflow into credit.
  payments: 300,
};

async function freshSeededDb(): Promise<SqlJsExecutor> {
  const db = await SqlJsExecutor.create();
  await applySchema(db);
  await seedDatabase(db, volumes);
  return db;
}

/** Full observable end state, normalised for comparison. */
async function dumpState(db: SqlJsExecutor): Promise<Record<string, unknown>> {
  return {
    stock: await db.query('SELECT id, qty_on_hand FROM stock ORDER BY id'),
    requisitions: await db.query('SELECT id, status FROM requisitions ORDER BY id'),
    lines: await db.query('SELECT id, qty_allocated FROM requisition_lines ORDER BY id'),
    allocations: await db.query(
      'SELECT requisition_line_id, stock_id, qty, unit_cost_cents FROM allocations ORDER BY requisition_line_id, stock_id',
    ),
    backorders: await db.query(
      'SELECT requisition_line_id, qty, status FROM backorders ORDER BY requisition_line_id',
    ),
    invoices: await db.query(
      'SELECT number, customer_id, requisition_id, total_cents, amount_paid_cents, status FROM invoices ORDER BY number',
    ),
    applications: await db.query(
      'SELECT payment_id, invoice_id, amount_cents FROM payment_applications ORDER BY payment_id, invoice_id',
    ),
    credits: await db.query(
      'SELECT customer_id, payment_id, amount_cents FROM credit_ledger ORDER BY payment_id',
    ),
  };
}

describe('naive vs optimized equivalence', () => {
  it('produces identical output, end state, and hash - with far fewer queries', async () => {
    const naiveDb = await freshSeededDb();
    const optimizedDb = await freshSeededDb();
    // The optimized variant also gets its composite indexes, as in the benchmark.
    await createCompositeIndexes(optimizedDb);

    const naive = await runPipeline('naive', naiveDb);
    const optimized = await runPipeline('optimized', optimizedDb);

    expect(optimized.outputHash).toBe(naive.outputHash);
    expect(optimized.totals).toEqual(naive.totals);
    expect(await dumpState(optimizedDb)).toEqual(await dumpState(naiveDb));

    // Sanity on the run itself: work actually happened...
    expect(naive.totals.allocations).toBeGreaterThan(0);
    expect(naive.totals.backorders).toBeGreaterThan(0);
    expect(naive.totals.invoicesCreated).toBeGreaterThan(0);
    expect(naive.totals.applications).toBeGreaterThan(0);
    expect(naive.totals.credits).toBeGreaterThan(0);

    // ...and the optimized variant did it in a fraction of the queries.
    expect(optimized.queries).toBeLessThan(naive.queries / 10);

    naiveDb.db.close();
    optimizedDb.db.close();
  }, 30000);
});
