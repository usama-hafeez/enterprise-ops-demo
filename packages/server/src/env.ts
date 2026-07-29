import * as path from 'path';
import * as dotenv from 'dotenv';
import { SeedConfig, defaultSeedConfig } from '@enterprise-ops/core';

// Load the repo-root .env; real environment variables still win.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  mysql: {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: num('MYSQL_PORT', 3306),
    user: process.env.MYSQL_USER ?? 'demo',
    password: process.env.MYSQL_PASSWORD ?? 'demo_local_only',
    database: process.env.MYSQL_DATABASE ?? 'enterprise_ops',
  },
  serverPort: num('SERVER_PORT', 3000),
};

export function seedConfigFromEnv(): SeedConfig {
  return {
    ...defaultSeedConfig,
    seed: num('SEED', defaultSeedConfig.seed),
    products: num('SEED_PRODUCTS', defaultSeedConfig.products),
    customers: num('SEED_CUSTOMERS', defaultSeedConfig.customers),
    requisitions: num('SEED_REQUISITIONS', defaultSeedConfig.requisitions),
    invoices: num('SEED_INVOICES', defaultSeedConfig.invoices),
    payments: num('SEED_PAYMENTS', defaultSeedConfig.payments),
  };
}
