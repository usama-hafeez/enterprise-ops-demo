export type Dialect = 'mysql' | 'sqlite';

export interface StatementResult {
  insertId: number;
  affectedRows: number;
}

/**
 * The pipeline talks to this interface only. The server binds it to mysql2,
 * the browser demo binds it to sql.js, and tests bind it to an in-memory
 * SQLite database - all running the same SQL.
 */
export interface DbExecutor {
  readonly dialect: Dialect;
  /** SELECT returning the full result set. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** INSERT / UPDATE / DELETE / DDL. */
  run(sql: string, params?: unknown[]): Promise<StatementResult>;
  /** SELECT streamed row by row - the result set is never materialised. */
  iterate<T = Record<string, unknown>>(sql: string, params?: unknown[]): AsyncIterable<T>;
  /** Runs fn inside a transaction; rolls back if fn throws. Not re-entrant. */
  transaction<R>(fn: (tx: DbExecutor) => Promise<R>): Promise<R>;
}
