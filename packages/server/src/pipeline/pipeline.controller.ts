import { BadRequestException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SeedConfig, Variant } from '@enterprise-ops/core';
import { seedConfigFromEnv } from '../env';
import { RunService, StoredRun } from './run.service';

const NUMERIC_OVERRIDES: (keyof SeedConfig)[] = [
  'seed',
  'products',
  'customers',
  'requisitions',
  'maxLinesPerRequisition',
  'maxQtyPerLine',
  'invoices',
  'payments',
];

@Controller()
export class PipelineController {
  constructor(private readonly runService: RunService) {}

  @Get('health')
  health(): { ok: boolean } {
    return { ok: true };
  }

  @Get('runs')
  list(): StoredRun[] {
    return this.runService.list();
  }

  /**
   * Runs one variant. Volume overrides (e.g. ?requisitions=40) allow small
   * runs; ?reseed=0 runs against the database exactly as it stands.
   */
  @Post('runs/:variant')
  async run(
    @Param('variant') variant: string,
    @Query() query: Record<string, string>,
  ): Promise<StoredRun> {
    if (variant !== 'naive' && variant !== 'optimized') {
      throw new BadRequestException(`unknown variant '${variant}' - use naive or optimized`);
    }
    const volumes = seedConfigFromEnv();
    for (const key of NUMERIC_OVERRIDES) {
      const raw = query[key];
      if (raw !== undefined) {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new BadRequestException(`invalid value for ${key}: ${raw}`);
        }
        volumes[key] = parsed;
      }
    }
    const reseed = query['reseed'] !== '0';
    return this.runService.execute(variant as Variant, volumes, reseed);
  }
}
