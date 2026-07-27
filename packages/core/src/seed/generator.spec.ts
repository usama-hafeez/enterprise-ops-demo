import { SqlJsExecutor } from '../db/sqljs-executor';
import { applySchema } from '../db/schema';
import { SeedConfig } from './config';
import { seedDatabase } from './generator';

const tiny: SeedConfig = {
  seed: 7,
  products: 20,
  customers: 5,
  requisitions: 10,
  maxLinesPerRequisition: 3,
  maxQtyPerLine: 8,
  invoices: 15,
  payments: 6,
};

describe('seedDatabase', () => {
  it('is deterministic for a given seed', async () => {
    const dump = async (): Promise<string> => {
      const db = await SqlJsExecutor.create();
      await applySchema(db);
      await seedDatabase(db, tiny);
      const stock = await db.query('SELECT * FROM stock ORDER BY id');
      const invoices = await db.query('SELECT * FROM invoices ORDER BY id');
      const payments = await db.query('SELECT * FROM payments ORDER BY id');
      db.db.close();
      return JSON.stringify([stock, invoices, payments]);
    };
    expect(await dump()).toBe(await dump());
  });

  it('creates the configured volumes', async () => {
    const db = await SqlJsExecutor.create();
    await applySchema(db);

    const summary = await seedDatabase(db, tiny);
    expect(summary.stockRows).toBe(20 * 4);

    const count = async (table: string): Promise<number> => {
      const rows = await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
      return rows[0]?.n ?? -1;
    };
    expect(await count('warehouses')).toBe(4);
    expect(await count('stock')).toBe(80);
    expect(await count('requisitions')).toBe(10);
    expect(await count('invoices')).toBe(15);
    expect(await count('payments')).toBe(6);
    expect(await count('requisition_lines')).toBe(summary.requisitionLines);

    db.db.close();
  });
});
