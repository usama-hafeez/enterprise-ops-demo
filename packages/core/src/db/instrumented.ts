import { DbExecutor, Dialect, StatementResult } from './executor';

export class QueryStats {
  queries = 0;

  reset(): void {
    this.queries = 0;
  }
}

/**
 * Counts every statement sent through it. Transaction control (BEGIN/COMMIT)
 * is not counted - only the statements the pipeline actually issues, so the
 * naive and optimized variants are compared on the same basis.
 */
export class InstrumentedExecutor implements DbExecutor {
  readonly dialect: Dialect;

  constructor(
    private readonly inner: DbExecutor,
    readonly stats: QueryStats = new QueryStats(),
  ) {
    this.dialect = inner.dialect;
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    this.stats.queries += 1;
    return this.inner.query<T>(sql, params);
  }

  run(sql: string, params?: unknown[]): Promise<StatementResult> {
    this.stats.queries += 1;
    return this.inner.run(sql, params);
  }

  iterate<T = Record<string, unknown>>(sql: string, params?: unknown[]): AsyncIterable<T> {
    this.stats.queries += 1;
    return this.inner.iterate<T>(sql, params);
  }

  transaction<R>(fn: (tx: DbExecutor) => Promise<R>): Promise<R> {
    return this.inner.transaction((tx) => fn(new InstrumentedExecutor(tx, this.stats)));
  }
}
