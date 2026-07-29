import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'mysql2/promise';
import {
  MemorySampler,
  PipelineRunResult,
  SeedConfig,
  Variant,
  createCompositeIndexes,
  dropCompositeIndexes,
  runPipeline,
  seedDatabase,
  truncateAll,
} from '@enterprise-ops/core';
import { seedConfigFromEnv } from '../env';
import { MysqlExecutor } from '../db/mysql-executor';

export const DB_POOL = 'DB_POOL';

export interface StoredRun extends PipelineRunResult {
  id: number;
  peakRssBytes: number;
  volumes: SeedConfig;
  startedAt: string;
}

@Injectable()
export class RunService {
  private readonly runs: StoredRun[] = [];
  private nextId = 1;

  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  /**
   * Reseed to a known state and set the indexes the variant is defined by:
   * composite indexes present for optimized, absent for naive.
   */
  async prepare(variant: Variant, volumes: SeedConfig): Promise<void> {
    const db = new MysqlExecutor(this.pool);
    await truncateAll(db);
    if (variant === 'optimized') {
      await createCompositeIndexes(db);
    } else {
      await dropCompositeIndexes(db);
    }
    await seedDatabase(db, volumes);
  }

  async execute(
    variant: Variant,
    volumes: SeedConfig = seedConfigFromEnv(),
    reseed = true,
  ): Promise<StoredRun> {
    if (reseed) {
      await this.prepare(variant, volumes);
    }
    const startedAt = new Date().toISOString();
    const sampler = new MemorySampler();
    sampler.start();
    const result = await runPipeline(variant, new MysqlExecutor(this.pool));
    const peakRssBytes = sampler.stop();
    const run: StoredRun = { id: this.nextId++, ...result, peakRssBytes, volumes, startedAt };
    this.runs.push(run);
    return run;
  }

  list(): StoredRun[] {
    return this.runs;
  }
}
