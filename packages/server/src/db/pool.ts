import { Pool, createPool } from 'mysql2/promise';
import { env } from '../env';

/** The one place pool options live - the API and the benchmark both use it. */
export function createAppPool(connectionLimit = 25): Pool {
  return createPool({
    ...env.mysql,
    connectionLimit,
    // Return DATETIME columns as strings, matching SQLite, so the two
    // executors are interchangeable.
    dateStrings: true,
  });
}
