import { Pool, createPool } from 'mysql2/promise';
import { allocateLine, resetSchema } from '@enterprise-ops/core';
import { env } from '../src/env';
import { MysqlExecutor } from '../src/db/mysql-executor';

/**
 * N parallel allocations against the same stock row. With SELECT ... FOR
 * UPDATE the row can never be oversold. The second test runs the identical
 * workload with locking disabled and asserts the oversell DOES happen -
 * green because it proves the failure mode the lock exists to prevent.
 */
describe('parallel allocation against one stock row', () => {
  const PARALLEL = 20;
  const ON_HAND = 5;

  let pool: Pool;
  let db: MysqlExecutor;

  beforeAll(async () => {
    pool = createPool({ ...env.mysql, connectionLimit: PARALLEL + 5, dateStrings: true });
    db = new MysqlExecutor(pool);
    await resetSchema(db);
    await db.run("INSERT INTO warehouses (code, name, distance_km) VALUES ('WH-N', 'North', 12)");
    await db.run(
      "INSERT INTO manufacturers (code, name, country) VALUES ('MFR-01', 'Manufacturer 01', 'Germany')",
    );
    await db.run(
      'INSERT INTO suppliers (code, name, email, country, lead_time_days) ' +
        "VALUES ('SUP-01', 'Supplier 01', 'sup-01@acme-parts.test', 'United Kingdom', 2)",
    );
    await db.run(
      "INSERT INTO products (sku, name, manufacturer_id) VALUES ('SKU-000001', 'Laptop Battery 000001', 1)",
    );
    await db.run(
      "INSERT INTO customers (name, email) VALUES ('Customer 0001', 'customer0001@acme-parts.test')",
    );
    await db.run(
      "INSERT INTO requisitions (ref, customer_id, status, created_at) VALUES ('REQ-000001', 1, 'pending', '2026-01-01 00:00:00')",
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.run('DELETE FROM allocations');
    await db.run('DELETE FROM backorders');
    await db.run('DELETE FROM requisition_lines');
    await db.run('DELETE FROM stock');
    await db.run(
      'INSERT INTO stock (product_id, warehouse_id, supplier_id, is_priority, unit_cost_cents, qty_on_hand) VALUES (1, 1, 1, 0, 100, ?)',
      [ON_HAND],
    );
    for (let i = 0; i < PARALLEL; i++) {
      await db.run(
        'INSERT INTO requisition_lines (requisition_id, product_id, qty_requested) VALUES (1, 1, 1)',
      );
    }
  });

  async function lineIds(): Promise<number[]> {
    const rows = await db.query<{ id: number }>('SELECT id FROM requisition_lines ORDER BY id');
    return rows.map((r) => r.id);
  }

  async function totals(): Promise<{ allocated: number; onHand: number; backordered: number }> {
    const [alloc] = await db.query<{ total: unknown }>(
      'SELECT COALESCE(SUM(qty), 0) AS total FROM allocations',
    );
    const [stock] = await db.query<{ qty: number }>('SELECT qty_on_hand AS qty FROM stock LIMIT 1');
    const [bo] = await db.query<{ total: unknown }>(
      'SELECT COALESCE(SUM(qty), 0) AS total FROM backorders',
    );
    return {
      allocated: Number(alloc?.total ?? 0),
      onHand: Number(stock?.qty ?? 0),
      backordered: Number(bo?.total ?? 0),
    };
  }

  it(`with row locking, ${PARALLEL} parallel allocations never oversell ${ON_HAND} units`, async () => {
    const ids = await lineIds();
    await Promise.all(
      ids.map((id) => allocateLine(db, { id, productId: 1, qtyRequested: 1 }, { lock: true })),
    );

    const t = await totals();
    expect(t.allocated).toBe(ON_HAND);
    expect(t.onHand).toBe(0);
    expect(t.backordered).toBe(PARALLEL - ON_HAND);
  });

  it('DEMONSTRATION: the identical workload without locking oversells the row', async () => {
    const ids = await lineIds();
    await Promise.all(
      ids.map((id) => allocateLine(db, { id, productId: 1, qtyRequested: 1 }, { lock: false })),
    );

    const t = await totals();
    // Every transaction read the same pre-update snapshot, believed the row
    // had stock, and allocated from it. This is the bug the lock prevents.
    expect(t.allocated).toBeGreaterThan(ON_HAND);
    expect(t.onHand).toBeLessThan(0);
  });
});
