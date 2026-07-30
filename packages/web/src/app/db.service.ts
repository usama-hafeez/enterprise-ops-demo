import { Injectable, signal } from '@angular/core';
import { SqlJsExecutor } from '@enterprise-ops/core';

/**
 * The demo database: the baked seed.sqlite loaded into sql.js on the main
 * thread. Module screens query it directly - at demo volumes every query is
 * sub-millisecond. Writes (new customers, requisitions, payments) go to the
 * in-memory copy only, so a refresh restores the seeded state.
 *
 * The Performance screen intentionally does NOT use this instance: each
 * benchmark run loads a fresh copy inside a Web Worker so runs are
 * repeatable and never see screen edits.
 */
@Injectable({ providedIn: 'root' })
export class DbService {
  private executor?: SqlJsExecutor;
  private initPromise?: Promise<void>;

  readonly ready = signal(false);
  readonly error = signal<string | undefined>(undefined);

  init(): Promise<void> {
    this.initPromise ??= (async () => {
      const res = await fetch('seed.sqlite');
      if (!res.ok) throw new Error(`seed.sqlite: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      this.executor = await SqlJsExecutor.create(bytes, {
        locateFile: (file) => new URL(file, document.baseURI).toString(),
      });
      this.ready.set(true);
    })().catch((err) => {
      this.error.set(String(err));
      throw err;
    });
    return this.initPromise;
  }

  /** The executor for core services (allocateLine, settlePayment). */
  get db(): SqlJsExecutor {
    if (!this.executor) throw new Error('database not loaded yet');
    return this.executor;
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.init();
    return this.db.query<T>(sql, params);
  }

  async one<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async run(sql: string, params: unknown[] = []): Promise<{ insertId: number }> {
    await this.init();
    return this.db.run(sql, params);
  }
}
