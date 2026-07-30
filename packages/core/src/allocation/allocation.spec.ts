import { SqlJsExecutor } from '../db/sqljs-executor';
import { applySchema } from '../db/schema';
import { StockCandidate, allocateLine, planAllocation } from './allocation.service';

describe('planAllocation (pure)', () => {
  const candidate = (
    id: number,
    qtyOnHand: number,
    unitCostCents = 100,
    warehouseId = 1,
  ): StockCandidate => ({ id, warehouseId, qtyOnHand, unitCostCents });

  it('takes from candidates in order until the request is satisfied', () => {
    const plan = planAllocation([candidate(1, 5), candidate(2, 10)], 8);
    expect(plan.takes).toEqual([
      { stockId: 1, warehouseId: 1, qty: 5, unitCostCents: 100 },
      { stockId: 2, warehouseId: 1, qty: 3, unitCostCents: 100 },
    ]);
    expect(plan.backorderQty).toBe(0);
  });

  it('backorders the remainder when stock runs out', () => {
    const plan = planAllocation([candidate(1, 3)], 10);
    expect(plan.takes).toEqual([{ stockId: 1, warehouseId: 1, qty: 3, unitCostCents: 100 }]);
    expect(plan.backorderQty).toBe(7);
  });

  it('backorders everything when there are no candidates', () => {
    expect(planAllocation([], 4)).toEqual({ takes: [], backorderQty: 4 });
  });
});

describe('allocateLine against a real (SQLite) database', () => {
  let db: SqlJsExecutor;

  beforeEach(async () => {
    db = await SqlJsExecutor.create();
    await applySchema(db);
    await db.run(
      'INSERT INTO warehouses (code, name, distance_km) VALUES ' +
        "('WH-N', 'North', 12), ('WH-S', 'South', 45), ('WH-E', 'East', 90), ('WH-W', 'West', 160)",
    );
    await db.run("INSERT INTO products (sku, name) VALUES ('SKU-000001', 'Part 000001')");
    await db.run(
      "INSERT INTO customers (name, email) VALUES ('Customer 0001', 'customer0001@acme-parts.test')",
    );
    await db.run(
      "INSERT INTO requisitions (ref, customer_id, status, created_at) VALUES ('REQ-000001', 1, 'pending', '2026-01-01 00:00:00')",
    );
  });

  afterEach(() => {
    db.db.close();
  });

  const addStock = (warehouseId: number, qty: number, costCents: number, priority = 0) =>
    db.run(
      'INSERT INTO stock (product_id, warehouse_id, is_priority, unit_cost_cents, qty_on_hand) VALUES (1, ?, ?, ?, ?)',
      [warehouseId, priority, costCents, qty],
    );

  const addLine = (qtyRequested: number) =>
    db.run(
      'INSERT INTO requisition_lines (requisition_id, product_id, qty_requested) VALUES (1, 1, ?)',
      [qtyRequested],
    );

  it('takes priority stock first even when it is farther and dearer', async () => {
    await addStock(1, 10, 100); // stock id 1: nearest and cheapest, not priority
    await addStock(4, 10, 900, 1); // stock id 2: farthest and dearest, priority
    await addLine(5);

    const outcome = await allocateLine(db, { id: 1, productId: 1, qtyRequested: 5 });

    expect(outcome.takes).toEqual([{ stockId: 2, warehouseId: 4, qty: 5, unitCostCents: 900 }]);
    expect(outcome.backorderQty).toBe(0);
  });

  it('prefers the nearest warehouse when priority is equal', async () => {
    await addStock(3, 10, 100); // stock id 1: East, 90 km
    await addStock(2, 10, 100); // stock id 2: South, 45 km
    await addLine(4);

    const outcome = await allocateLine(db, { id: 1, productId: 1, qtyRequested: 4 });

    expect(outcome.takes).toEqual([{ stockId: 2, warehouseId: 2, qty: 4, unitCostCents: 100 }]);
  });

  it('prefers the lowest cost within the same warehouse', async () => {
    await addStock(1, 10, 500); // stock id 1
    await addStock(1, 10, 200); // stock id 2: same warehouse, cheaper
    await addLine(6);

    const outcome = await allocateLine(db, { id: 1, productId: 1, qtyRequested: 6 });

    expect(outcome.takes).toEqual([{ stockId: 2, warehouseId: 1, qty: 6, unitCostCents: 200 }]);
  });

  it('spills across warehouses and backorders the shortfall', async () => {
    await addStock(1, 4, 100); // stock id 1
    await addStock(2, 3, 100); // stock id 2
    await addLine(20);

    const outcome = await allocateLine(db, { id: 1, productId: 1, qtyRequested: 20 });

    expect(outcome.takes).toEqual([
      { stockId: 1, warehouseId: 1, qty: 4, unitCostCents: 100 },
      { stockId: 2, warehouseId: 2, qty: 3, unitCostCents: 100 },
    ]);
    expect(outcome.backorderQty).toBe(13);

    const stock = await db.query('SELECT id, qty_on_hand FROM stock ORDER BY id');
    expect(stock).toEqual([
      { id: 1, qty_on_hand: 0 },
      { id: 2, qty_on_hand: 0 },
    ]);

    const backorders = await db.query('SELECT requisition_line_id, qty, status FROM backorders');
    expect(backorders).toEqual([{ requisition_line_id: 1, qty: 13, status: 'open' }]);

    const lines = await db.query('SELECT qty_allocated FROM requisition_lines WHERE id = 1');
    expect(lines).toEqual([{ qty_allocated: 7 }]);

    const allocations = await db.query(
      'SELECT requisition_line_id, stock_id, qty FROM allocations ORDER BY id',
    );
    expect(allocations).toEqual([
      { requisition_line_id: 1, stock_id: 1, qty: 4 },
      { requisition_line_id: 1, stock_id: 2, qty: 3 },
    ]);
  });

  it('creates a full backorder when nothing is in stock', async () => {
    await addLine(9);

    const outcome = await allocateLine(db, { id: 1, productId: 1, qtyRequested: 9 });

    expect(outcome.takes).toEqual([]);
    expect(outcome.backorderQty).toBe(9);

    const backorders = await db.query('SELECT qty FROM backorders');
    expect(backorders).toEqual([{ qty: 9 }]);

    const lines = await db.query('SELECT qty_allocated FROM requisition_lines WHERE id = 1');
    expect(lines).toEqual([{ qty_allocated: 0 }]);

    const allocations = await db.query('SELECT id FROM allocations');
    expect(allocations).toEqual([]);
  });
});
