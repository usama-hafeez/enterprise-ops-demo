import { createPool } from 'mysql2/promise';
import { createCompositeIndexes, seedDatabase, truncateAll } from '@enterprise-ops/core';
import { env, seedConfigFromEnv } from '../env';
import { MysqlExecutor } from '../db/mysql-executor';

async function main(): Promise<void> {
  const pool = createPool({ ...env.mysql, dateStrings: true });
  const db = new MysqlExecutor(pool);
  const cfg = seedConfigFromEnv();
  await truncateAll(db);
  await createCompositeIndexes(db);
  const summary = await seedDatabase(db, cfg);
  console.log('seeded:', JSON.stringify(summary));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
