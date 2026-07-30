import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DbExecutor, StatementResult } from '@enterprise-ops/core';

type Queryable = Pool | PoolConnection;

/**
 * DbExecutor over a mysql2 pool. Transactions check a connection out of the
 * pool; iterate() streams rows off the wire instead of buffering the result
 * set, which is what keeps the CSV export and the optimized pipeline's
 * memory flat.
 */
export class MysqlExecutor implements DbExecutor {
  readonly dialect = 'mysql' as const;

  constructor(
    private readonly source: Queryable,
    private readonly isTransaction = false,
  ) {}

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.source.query<RowDataPacket[]>(sql, params);
    return rows as unknown as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<StatementResult> {
    const [result] = await this.source.query<ResultSetHeader>(sql, params);
    return { insertId: result.insertId ?? 0, affectedRows: result.affectedRows ?? 0 };
  }

  async *iterate<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): AsyncIterableIterator<T> {
    const conn = this.isTransaction
      ? (this.source as PoolConnection)
      : await (this.source as Pool).getConnection();
    try {
      // Drop to the callback-style connection to get a row stream; the
      // promise wrapper has no streaming API.
       
      const stream = (conn.connection.query(sql, params as any) as any).stream();
      for await (const row of stream) {
        yield row as T;
      }
    } finally {
      if (!this.isTransaction) (conn as PoolConnection).release();
    }
  }

  async transaction<R>(fn: (tx: DbExecutor) => Promise<R>): Promise<R> {
    if (this.isTransaction) {
      throw new Error('MysqlExecutor does not support nested transactions');
    }
    const conn = await (this.source as Pool).getConnection();
    try {
      await conn.beginTransaction();
      try {
        const result = await fn(new MysqlExecutor(conn, true));
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    } finally {
      conn.release();
    }
  }
}
