/**
 * Bakes the browser demo's static inputs into public/:
 *   - seed.sqlite          the pre-pipeline database the demo runs against
 *   - browser-volumes.json the volumes it was seeded with (shown in the UI)
 *   - results.json         the latest CI benchmark results (MySQL headline)
 *
 * Runs before every ng build/serve. Plain Node script against the compiled
 * core package - deliberately no TypeScript toolchain of its own.
 *
 * The browser runs half the MySQL benchmark's volumes: the full seed is a
 * 4 MB download for little extra signal, since sql.js has no network
 * round-trips and the wall-clock gap stays modest either way. The query
 * counts tell the story in the browser; MySQL in CI is the headline.
 */
const fs = require('fs');
const path = require('path');
const core = require('@enterprise-ops/core');

const BROWSER_VOLUMES = {
  seed: 42,
  products: 6250,
  customers: 100,
  requisitions: 500,
  maxLinesPerRequisition: 5,
  maxQtyPerLine: 20,
  invoices: 10000,
  payments: 2500,
};

(async () => {
  const db = await core.SqlJsExecutor.create();
  await core.applySchema(db);
  await core.seedDatabase(db, BROWSER_VOLUMES);
  const publicDir = path.resolve(__dirname, '../public');
  const bytes = db.export();
  fs.writeFileSync(path.join(publicDir, 'seed.sqlite'), Buffer.from(bytes));
  fs.writeFileSync(
    path.join(publicDir, 'browser-volumes.json'),
    JSON.stringify(BROWSER_VOLUMES, null, 2) + '\n',
  );
  fs.copyFileSync(
    path.resolve(__dirname, '../../../benchmarks/results.json'),
    path.join(publicDir, 'results.json'),
  );
  // sql.js is hoisted to the repo-root node_modules, outside the Angular
  // workspace, so angular.json assets cannot reach it - copy the wasm here.
  // The bundler resolves sql.js through its exports map's "browser"
  // condition (dist/sql-wasm-browser.js), whose glue requests
  // sql-wasm-browser.wasm - not the sql-wasm.wasm the Node build uses.
  fs.copyFileSync(
    path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm-browser.wasm'),
    path.join(publicDir, 'sql-wasm-browser.wasm'),
  );
  console.log(`baked seed.sqlite (${(bytes.length / 1024 / 1024).toFixed(1)} MB) + results.json`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
