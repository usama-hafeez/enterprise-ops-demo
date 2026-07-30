import { DbExecutor } from '../db/executor';
import { Rng } from './rng';
import { SeedConfig, WAREHOUSES, defaultSeedConfig } from './config';

// Fixed epoch (2025-07-01T00:00:00Z) so generated timestamps are reproducible.
const BASE_MS = Date.UTC(2025, 6, 1);
const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function ts(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ` +
    `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}`
  );
}

export interface SeedSummary {
  products: number;
  customers: number;
  stockRows: number;
  requisitions: number;
  requisitionLines: number;
  invoices: number;
  payments: number;
}

/** Multi-row INSERT in batches - seeding must not itself be the slow path. */
export async function insertMany(
  db: DbExecutor,
  table: string,
  columns: string[],
  rows: unknown[][],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    await db.run(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`,
      batch.flat(),
    );
  }
}

export async function seedDatabase(
  db: DbExecutor,
  cfg: SeedConfig = defaultSeedConfig,
): Promise<SeedSummary> {
  const rng = new Rng(cfg.seed);

  await insertMany(
    db,
    'warehouses',
    ['code', 'name', 'distance_km'],
    WAREHOUSES.map((w) => [w.code, w.name, w.distanceKm]),
  );

  const products: unknown[][] = [];
  for (let i = 1; i <= cfg.products; i++) {
    products.push([`SKU-${pad(i, 6)}`, `Part ${pad(i, 6)}`]);
  }
  await insertMany(db, 'products', ['sku', 'name'], products);

  const customers: unknown[][] = [];
  for (let i = 1; i <= cfg.customers; i++) {
    customers.push([`Customer ${pad(i, 4)}`, `customer${pad(i, 4)}@acme-parts.test`]);
  }
  await insertMany(db, 'customers', ['name', 'email'], customers);

  // One stock row per product per warehouse; some rows empty so allocation
  // has to spill across warehouses and create backorders.
  const stock: unknown[][] = [];
  for (let p = 1; p <= cfg.products; p++) {
    for (let w = 1; w <= WAREHOUSES.length; w++) {
      stock.push([
        p,
        w,
        rng.chance(0.15) ? 1 : 0,
        rng.int(100, 50_000),
        rng.chance(0.25) ? 0 : rng.int(1, 30),
      ]);
    }
  }
  await insertMany(
    db,
    'stock',
    ['product_id', 'warehouse_id', 'is_priority', 'unit_cost_cents', 'qty_on_hand'],
    stock,
  );

  const requisitions: unknown[][] = [];
  const lines: unknown[][] = [];
  for (let r = 1; r <= cfg.requisitions; r++) {
    requisitions.push([
      `REQ-${pad(r, 6)}`,
      rng.int(1, cfg.customers),
      'pending',
      ts(BASE_MS + rng.int(0, 180 * DAY_MINUTES) * MINUTE_MS),
    ]);
    const lineCount = rng.int(1, cfg.maxLinesPerRequisition);
    for (let l = 0; l < lineCount; l++) {
      lines.push([r, rng.int(1, cfg.products), rng.int(1, cfg.maxQtyPerLine), 0]);
    }
  }
  await insertMany(
    db,
    'requisitions',
    ['ref', 'customer_id', 'status', 'created_at'],
    requisitions,
  );
  await insertMany(
    db,
    'requisition_lines',
    ['requisition_id', 'product_id', 'qty_requested', 'qty_allocated'],
    lines,
  );

  // Historical invoices: ~70% open, ~20% partially paid, ~10% settled.
  const invoices: unknown[][] = [];
  for (let i = 1; i <= cfg.invoices; i++) {
    const total = rng.int(500, 500_000);
    const roll = rng.next();
    let paid = 0;
    let status = 'open';
    if (roll >= 0.9) {
      paid = total;
      status = 'paid';
    } else if (roll >= 0.7) {
      paid = rng.int(1, total - 1);
      status = 'partial';
    }
    invoices.push([
      `INV-${pad(i, 6)}`,
      rng.int(1, cfg.customers),
      null,
      total,
      paid,
      status,
      ts(BASE_MS - rng.int(1, 365 * DAY_MINUTES) * MINUTE_MS),
    ]);
  }
  await insertMany(
    db,
    'invoices',
    [
      'number',
      'customer_id',
      'requisition_id',
      'total_cents',
      'amount_paid_cents',
      'status',
      'issued_at',
    ],
    invoices,
  );

  const payments: unknown[][] = [];
  for (let i = 1; i <= cfg.payments; i++) {
    payments.push([
      rng.int(1, cfg.customers),
      rng.int(1_000, 300_000),
      ts(BASE_MS + rng.int(0, 90 * DAY_MINUTES) * MINUTE_MS),
    ]);
  }
  await insertMany(db, 'payments', ['customer_id', 'amount_cents', 'received_at'], payments);

  return {
    products: cfg.products,
    customers: cfg.customers,
    stockRows: stock.length,
    requisitions: cfg.requisitions,
    requisitionLines: lines.length,
    invoices: cfg.invoices,
    payments: cfg.payments,
  };
}
