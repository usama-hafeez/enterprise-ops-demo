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
 * Default volumes: ~50k stock rows (products x 4 warehouses), 500
 * requisitions, 10k invoices. Tuned so the naive pipeline takes on the
 * order of a minute against MySQL while the optimized one takes seconds.
 */
export const defaultSeedConfig: SeedConfig = {
  seed: 42,
  products: 12500,
  customers: 200,
  requisitions: 500,
  maxLinesPerRequisition: 5,
  maxQtyPerLine: 20,
  invoices: 10000,
  payments: 2000,
};

export const WAREHOUSES = [
  { code: 'WH-N', name: 'North Distribution Centre', distanceKm: 12 },
  { code: 'WH-S', name: 'South Depot', distanceKm: 45 },
  { code: 'WH-E', name: 'East Fulfilment Hub', distanceKm: 90 },
  { code: 'WH-W', name: 'West Overflow Store', distanceKm: 160 },
] as const;
