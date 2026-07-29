import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Pool } from 'mysql2/promise';
import { TABLES_DROP_ORDER, truncateAll } from '@enterprise-ops/core';
import { AppModule } from '../src/app.module';
import { AppDataSource } from '../src/db/data-source';
import { MysqlExecutor } from '../src/db/mysql-executor';
import { DB_POOL } from '../src/pipeline/run.service';

describe('pipeline end to end (MySQL)', () => {
  let app: INestApplication;
  let pool: Pool;
  let db: MysqlExecutor;

  beforeAll(async () => {
    // Start from nothing and build the schema the way production would:
    // through the migrations.
    const ds = await AppDataSource.initialize();
    for (const table of TABLES_DROP_ORDER) {
      await ds.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await ds.query('DROP TABLE IF EXISTS migrations');
    await ds.destroy();
    const ds2 = await AppDataSource.initialize();
    await ds2.runMigrations();
    await ds2.destroy();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    pool = app.get<Pool>(DB_POOL);
    db = new MysqlExecutor(pool);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('walks a requisition through allocation, backorder, invoice, and FIFO settlement', async () => {
    // Hand-built micro world: 3 units on hand, 10 requested, and a payment
    // worth more than the resulting invoice.
    await truncateAll(db);
    await db.run("INSERT INTO warehouses (code, name, distance_km) VALUES ('WH-N', 'North', 12)");
    await db.run("INSERT INTO products (sku, name) VALUES ('SKU-000001', 'Part 000001')");
    await db.run(
      "INSERT INTO customers (name, email) VALUES ('Customer 0001', 'customer0001@acme-parts.test')",
    );
    await db.run(
      "INSERT INTO requisitions (ref, customer_id, status, created_at) VALUES ('REQ-000001', 1, 'pending', '2026-01-01 00:00:00')",
    );
    await db.run(
      'INSERT INTO requisition_lines (requisition_id, product_id, qty_requested) VALUES (1, 1, 10)',
    );
    await db.run(
      'INSERT INTO stock (product_id, warehouse_id, is_priority, unit_cost_cents, qty_on_hand) VALUES (1, 1, 0, 100, 3)',
    );
    await db.run(
      "INSERT INTO payments (customer_id, amount_cents, received_at) VALUES (1, 700, '2026-06-01 00:00:00')",
    );

    const res = await request(app.getHttpServer()).post('/runs/optimized?reseed=0').expect(201);
    expect(res.body.totals).toMatchObject({
      requisitions: 1,
      lines: 1,
      allocations: 1,
      backorders: 1,
      invoicesCreated: 1,
      payments: 1,
      applications: 1,
      credits: 1,
    });

    // Allocation took the 3 available units...
    const allocations = await db.query('SELECT stock_id, qty FROM allocations');
    expect(allocations).toEqual([{ stock_id: 1, qty: 3 }]);
    // ...the shortfall became a backorder...
    const backorders = await db.query('SELECT qty, status FROM backorders');
    expect(backorders).toEqual([{ qty: 7, status: 'open' }]);
    // ...the allocated value was invoiced (3 x 100)...
    const invoices = await db.query(
      'SELECT number, total_cents, amount_paid_cents, status FROM invoices',
    );
    expect(invoices).toEqual([
      { number: 'INV-R000001', total_cents: 300, amount_paid_cents: 300, status: 'paid' },
    ]);
    // ...and the 700 payment settled it FIFO with the surplus booked as credit.
    const applications = await db.query('SELECT payment_id, invoice_id, amount_cents FROM payment_applications');
    expect(applications).toEqual([{ payment_id: 1, invoice_id: 1, amount_cents: 300 }]);
    const credits = await db.query('SELECT payment_id, amount_cents FROM credit_ledger');
    expect(credits).toEqual([{ payment_id: 1, amount_cents: 400 }]);
  });

  const smallVolumes =
    'seed=1234&products=60&customers=12&requisitions=40&invoices=80&payments=300';

  it('naive and optimized produce identical output on MySQL', async () => {
    const naive = await request(app.getHttpServer())
      .post(`/runs/naive?${smallVolumes}`)
      .expect(201);
    const optimized = await request(app.getHttpServer())
      .post(`/runs/optimized?${smallVolumes}`)
      .expect(201);

    expect(optimized.body.outputHash).toBe(naive.body.outputHash);
    expect(optimized.body.totals).toEqual(naive.body.totals);
    expect(optimized.body.queries).toBeLessThan(naive.body.queries / 10);
    expect(naive.body.peakRssBytes).toBeGreaterThan(0);
    expect(optimized.body.peakRssBytes).toBeGreaterThan(0);
  });

  it('streams the run as CSV', async () => {
    const res = await request(app.getHttpServer()).get('/runs/export.csv').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(
      'record_type,requisition_ref,product_sku,warehouse,payment_id,invoice_number,qty,amount_cents',
    );
    expect(lines.some((l) => l.startsWith('allocation,REQ-'))).toBe(true);
    expect(lines.some((l) => l.startsWith('settlement,'))).toBe(true);
  });

  it('lists completed runs and rejects unknown variants', async () => {
    const runs = await request(app.getHttpServer()).get('/runs').expect(200);
    expect(runs.body.length).toBeGreaterThanOrEqual(3);
    await request(app.getHttpServer()).post('/runs/bogus').expect(400);
  });
});
