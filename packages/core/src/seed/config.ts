export interface SeedConfig {
  seed: number;
  products: number;
  customers: number;
  requisitions: number;
  maxLinesPerRequisition: number;
  maxQtyPerLine: number;
  invoices: number;
  payments: number;
}

/**
 * Default volumes: ~50k stock rows (products x 4 warehouses), 1,000
 * requisitions, 20k invoices, 5,000 payments. Tuned so the naive pipeline
 * takes over a minute against local MySQL while the optimized one takes
 * seconds; benchmarks/results.json records what was actually measured.
 */
export const defaultSeedConfig: SeedConfig = {
  seed: 42,
  products: 12500,
  customers: 200,
  requisitions: 1000,
  maxLinesPerRequisition: 5,
  maxQtyPerLine: 20,
  invoices: 20000,
  payments: 5000,
};

/**
 * Overlays SEED_* variables from any env-like source (process.env, a CI
 * matrix, a test) onto the defaults. Unset or non-numeric values fall back.
 */
export function seedConfigFrom(source: Record<string, string | undefined>): SeedConfig {
  const num = (name: string, fallback: number): number => {
    const raw = source[name];
    const parsed = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
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

export const WAREHOUSES = [
  { code: 'WH-N', name: 'North Distribution Centre', distanceKm: 12 },
  { code: 'WH-S', name: 'South Depot', distanceKm: 45 },
  { code: 'WH-E', name: 'East Fulfilment Hub', distanceKm: 90 },
  { code: 'WH-W', name: 'West Overflow Store', distanceKm: 160 },
] as const;
