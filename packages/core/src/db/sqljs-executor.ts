import initSqlJs from 'sql.js';
import { DbExecutor, StatementResult } from './executor';

type Database = import('sql.js').Database;
type BindValue = string | number | null | Uint8Array;

/**
 * DbExecutor over sql.js (SQLite compiled to WASM). Used by the hosted
 * browser demo and by the core test suite. Single-connection and
 * synchronous underneath, so transactions are plain BEGIN/COMMIT and
 * row-level locking is a no-op (SQLite has no concurrent writers here).
 */
export class SqlJsExecutor implements DbExecutor {
  readonly dialect = 'sqlite' as const;
  private inTransaction = false;

  constructor(readonly db: Database) {}

  static async create(
    data?: Uint8Array,
    config?: Parameters<typeof initSqlJs>[0],
  ): Promise<SqlJsExecutor> {
    const SQL = await initSqlJs(config);
    const db = data ? new SQL.Database(data) : new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    return new SqlJsExecutor(db);
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as BindValue[]);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as unknown as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  async run(sql: string, params: unknown[] = []): Promise<StatementResult> {
    this.db.run(sql, params as BindValue[]);
    const affectedRows = this.db.getRowsModified();
    const result = this.db.exec('SELECT last_insert_rowid()');
    const insertId = Number(result[0]?.values[0]?.[0] ?? 0);
    return { insertId, affectedRows };
  }

  async *iterate<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): AsyncIterableIterator<T> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as BindValue[]);
      while (stmt.step()) {
        yield stmt.getAsObject() as unknown as T;
      }
    } finally {
      stmt.free();
    }
  }

  async transaction<R>(fn: (tx: DbExecutor) => Promise<R>): Promise<R> {
    if (this.inTransaction) {
      throw new Error('SqlJsExecutor does not support nested transactions');
    }
    this.inTransaction = true;
    this.db.run('BEGIN');
    try {
      const result = await fn(this);
      this.db.run('COMMIT');
      return result;
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  /** Serialises the database, e.g. to bake the browser demo's seed file. */
  export(): Uint8Array {
    return this.db.export();
  }
}
