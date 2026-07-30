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

/**
 * Generic laptop spare-part categories. Category names only - deliberately
 * no brand, model, or series names, so nothing can resemble a real
 * manufacturer's catalogue.
 */
export const PART_TYPES = [
  'Laptop Battery',
  'Keyboard',
  'LCD Panel 15.6"',
  'LCD Panel 14"',
  'Trackpad',
  'Cooling Fan',
  'CPU Heatsink',
  'RAM Module 8GB',
  'RAM Module 16GB',
  'SSD 512GB',
  'SSD 1TB',
  'Motherboard',
  'Hinge Set',
  'Display Cable',
  'Webcam Module',
  'Speaker Set',
  'AC Adapter 65W',
  'AC Adapter 90W',
  'Palmrest Assembly',
  'Bottom Case',
] as const;

// Fixed catalogues in the same deliberately generic naming scheme as the
// rest of the seed data (numbered names, acme-parts.test emails) - nothing
// here resembles any real company.
export const MANUFACTURERS = [
  { code: 'MFR-01', name: 'Manufacturer 01', country: 'Germany' },
  { code: 'MFR-02', name: 'Manufacturer 02', country: 'Italy' },
  { code: 'MFR-03', name: 'Manufacturer 03', country: 'Japan' },
  { code: 'MFR-04', name: 'Manufacturer 04', country: 'United Kingdom' },
  { code: 'MFR-05', name: 'Manufacturer 05', country: 'United States' },
  { code: 'MFR-06', name: 'Manufacturer 06', country: 'France' },
  { code: 'MFR-07', name: 'Manufacturer 07', country: 'Spain' },
  { code: 'MFR-08', name: 'Manufacturer 08', country: 'Sweden' },
  { code: 'MFR-09', name: 'Manufacturer 09', country: 'Netherlands' },
  { code: 'MFR-10', name: 'Manufacturer 10', country: 'Austria' },
  { code: 'MFR-11', name: 'Manufacturer 11', country: 'Poland' },
  { code: 'MFR-12', name: 'Manufacturer 12', country: 'Czechia' },
] as const;

export const SUPPLIERS = [
  { code: 'SUP-01', name: 'Supplier 01', country: 'United Kingdom', leadTimeDays: 2 },
  { code: 'SUP-02', name: 'Supplier 02', country: 'Germany', leadTimeDays: 4 },
  { code: 'SUP-03', name: 'Supplier 03', country: 'Italy', leadTimeDays: 6 },
  { code: 'SUP-04', name: 'Supplier 04', country: 'France', leadTimeDays: 5 },
  { code: 'SUP-05', name: 'Supplier 05', country: 'Netherlands', leadTimeDays: 3 },
  { code: 'SUP-06', name: 'Supplier 06', country: 'Spain', leadTimeDays: 7 },
  { code: 'SUP-07', name: 'Supplier 07', country: 'Poland', leadTimeDays: 8 },
  { code: 'SUP-08', name: 'Supplier 08', country: 'United States', leadTimeDays: 12 },
  { code: 'SUP-09', name: 'Supplier 09', country: 'Japan', leadTimeDays: 14 },
  { code: 'SUP-10', name: 'Supplier 10', country: 'Sweden', leadTimeDays: 5 },
  { code: 'SUP-11', name: 'Supplier 11', country: 'Austria', leadTimeDays: 4 },
  { code: 'SUP-12', name: 'Supplier 12', country: 'Belgium', leadTimeDays: 3 },
  { code: 'SUP-13', name: 'Supplier 13', country: 'Portugal', leadTimeDays: 9 },
  { code: 'SUP-14', name: 'Supplier 14', country: 'Denmark', leadTimeDays: 6 },
  { code: 'SUP-15', name: 'Supplier 15', country: 'Switzerland', leadTimeDays: 4 },
] as const;
