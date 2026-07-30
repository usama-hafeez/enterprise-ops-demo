import { DbExecutor, Dialect } from './executor';

/**
 * One schema definition, emitted per dialect, so the MySQL migrations, the
 * SQLite browser demo, and the test suite can never drift apart.
 *
 * Note on "no indexes" in the naive variant: InnoDB always indexes primary
 * keys, foreign keys, and UNIQUE constraints - those stay. What the naive
 * variant runs without are the composite indexes below, which cover the
 * pipeline's actual access paths.
 */
export function tableDdl(dialect: Dialect): string[] {
  const pk =
    dialect === 'mysql'
      ? 'id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY'
      : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
  const engine = dialect === 'mysql' ? ' ENGINE=InnoDB' : '';
  return [
    `CREATE TABLE warehouses (
      ${pk},
      code VARCHAR(16) NOT NULL UNIQUE,
      name VARCHAR(64) NOT NULL,
      distance_km INT NOT NULL
    )${engine}`,
    `CREATE TABLE products (
      ${pk},
      sku VARCHAR(32) NOT NULL UNIQUE,
      name VARCHAR(128) NOT NULL
    )${engine}`,
    `CREATE TABLE customers (
      ${pk},
      name VARCHAR(128) NOT NULL,
      email VARCHAR(128) NOT NULL
    )${engine}`,
    `CREATE TABLE stock (
      ${pk},
      product_id INT UNSIGNED NOT NULL,
      warehouse_id INT UNSIGNED NOT NULL,
      is_priority TINYINT NOT NULL DEFAULT 0,
      unit_cost_cents INT NOT NULL,
      qty_on_hand INT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products (id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses (id)
    )${engine}`,
    `CREATE TABLE requisitions (
      ${pk},
      ref VARCHAR(16) NOT NULL UNIQUE,
      customer_id INT UNSIGNED NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers (id)
    )${engine}`,
    `CREATE TABLE requisition_lines (
      ${pk},
      requisition_id INT UNSIGNED NOT NULL,
      product_id INT UNSIGNED NOT NULL,
      qty_requested INT NOT NULL,
      qty_allocated INT NOT NULL DEFAULT 0,
      FOREIGN KEY (requisition_id) REFERENCES requisitions (id),
      FOREIGN KEY (product_id) REFERENCES products (id)
    )${engine}`,
    `CREATE TABLE allocations (
      ${pk},
      requisition_line_id INT UNSIGNED NOT NULL,
      stock_id INT UNSIGNED NOT NULL,
      qty INT NOT NULL,
      unit_cost_cents INT NOT NULL,
      created_at DATETIME NOT NULL,
      FOREIGN KEY (requisition_line_id) REFERENCES requisition_lines (id),
      FOREIGN KEY (stock_id) REFERENCES stock (id)
    )${engine}`,
    `CREATE TABLE backorders (
      ${pk},
      requisition_line_id INT UNSIGNED NOT NULL,
      qty INT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'open',
      FOREIGN KEY (requisition_line_id) REFERENCES requisition_lines (id)
    )${engine}`,
    `CREATE TABLE invoices (
      ${pk},
      number VARCHAR(16) NOT NULL UNIQUE,
      customer_id INT UNSIGNED NOT NULL,
      requisition_id INT UNSIGNED NULL,
      total_cents INT NOT NULL,
      amount_paid_cents INT NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'open',
      issued_at DATETIME NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (requisition_id) REFERENCES requisitions (id)
    )${engine}`,
    `CREATE TABLE payments (
      ${pk},
      customer_id INT UNSIGNED NOT NULL,
      amount_cents INT NOT NULL,
      received_at DATETIME NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers (id)
    )${engine}`,
    `CREATE TABLE payment_applications (
      ${pk},
      payment_id INT UNSIGNED NOT NULL,
      invoice_id INT UNSIGNED NOT NULL,
      amount_cents INT NOT NULL,
      FOREIGN KEY (payment_id) REFERENCES payments (id),
      FOREIGN KEY (invoice_id) REFERENCES invoices (id)
    )${engine}`,
    `CREATE TABLE credit_ledger (
      ${pk},
      customer_id INT UNSIGNED NOT NULL,
      payment_id INT UNSIGNED NOT NULL,
      amount_cents INT NOT NULL,
      created_at DATETIME NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers (id),
      FOREIGN KEY (payment_id) REFERENCES payments (id)
    )${engine}`,
    // Permanent single-column indexes on the two foreign keys that also lead
    // a composite index. InnoDB keeps an implicit index on every foreign key
    // but silently drops it once a user index with the same leading column
    // exists - which would make idx_stock_alloc / idx_invoices_fifo
    // impossible to drop again ("needed in a foreign key constraint").
    // Declaring the indexes ourselves pins them, so the composites stay
    // freely creatable and droppable.
    'CREATE INDEX idx_stock_product ON stock (product_id)',
    'CREATE INDEX idx_invoices_customer ON invoices (customer_id)',
  ];
}

/** Reverse dependency order, safe for DROP TABLE. */
export const TABLES_DROP_ORDER = [
  'credit_ledger',
  'payment_applications',
  'payments',
  'invoices',
  'backorders',
  'allocations',
  'requisition_lines',
  'requisitions',
  'stock',
  'customers',
  'products',
  'warehouses',
];

export interface IndexDef {
  name: string;
  table: string;
  columns: string[];
}

/** The composite indexes the optimized variant runs with and the naive one runs without. */
export const compositeIndexes: IndexDef[] = [
  {
    name: 'idx_stock_alloc',
    table: 'stock',
    columns: ['product_id', 'is_priority', 'unit_cost_cents'],
  },
  { name: 'idx_invoices_fifo', table: 'invoices', columns: ['customer_id', 'status', 'issued_at'] },
  { name: 'idx_requisitions_status', table: 'requisitions', columns: ['status', 'created_at'] },
];

export async function applySchema(db: DbExecutor): Promise<void> {
  for (const ddl of tableDdl(db.dialect)) {
    await db.run(ddl);
  }
}

export async function resetSchema(db: DbExecutor): Promise<void> {
  for (const table of TABLES_DROP_ORDER) {
    await db.run(`DROP TABLE IF EXISTS ${table}`);
  }
  await applySchema(db);
}

/**
 * Empties every table and resets auto-increment counters, leaving the schema
 * (and whatever indexes exist) in place. Faster than drop-and-recreate when
 * reseeding between benchmark runs, and keeps generated ids deterministic.
 */
export async function truncateAll(db: DbExecutor): Promise<void> {
  if (db.dialect === 'mysql') {
    await db.run('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLES_DROP_ORDER) {
      await db.run(`TRUNCATE TABLE ${table}`);
    }
    await db.run('SET FOREIGN_KEY_CHECKS = 1');
  } else {
    for (const table of TABLES_DROP_ORDER) {
      await db.run(`DELETE FROM ${table}`);
    }
    // Reset AUTOINCREMENT counters so both dialects hand out the same ids.
    await db.run(
      "DELETE FROM sqlite_sequence WHERE name IN ('" + TABLES_DROP_ORDER.join("', '") + "')",
    );
  }
}

async function mysqlIndexExists(db: DbExecutor, index: IndexDef): Promise<boolean> {
  const rows = await db.query(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
    [index.table, index.name],
  );
  return rows.length > 0;
}

export async function createCompositeIndexes(db: DbExecutor): Promise<void> {
  for (const index of compositeIndexes) {
    const create = `CREATE INDEX ${index.name} ON ${index.table} (${index.columns.join(', ')})`;
    if (db.dialect === 'mysql') {
      if (!(await mysqlIndexExists(db, index))) {
        await db.run(create);
      }
    } else {
      await db.run(create.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS'));
    }
  }
}

export async function dropCompositeIndexes(db: DbExecutor): Promise<void> {
  for (const index of compositeIndexes) {
    if (db.dialect === 'mysql') {
      if (await mysqlIndexExists(db, index)) {
        await db.run(`DROP INDEX ${index.name} ON ${index.table}`);
      }
    } else {
      await db.run(`DROP INDEX IF EXISTS ${index.name}`);
    }
  }
}
