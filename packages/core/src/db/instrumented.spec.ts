import { InstrumentedExecutor } from './instrumented';
import { SqlJsExecutor } from './sqljs-executor';
import { applySchema } from './schema';

describe('InstrumentedExecutor', () => {
  it('counts every statement, including inside transactions', async () => {
    const raw = await SqlJsExecutor.create();
    await applySchema(raw);
    const db = new InstrumentedExecutor(raw);

    await db.run(
      "INSERT INTO customers (name, email) VALUES ('Customer 0001', 'customer0001@acme-parts.test')",
    );
    await db.query('SELECT id FROM customers');
    await db.transaction(async (tx) => {
      await tx.query('SELECT id FROM customers');
    });

    expect(db.stats.queries).toBe(3);
    raw.db.close();
  });
});
