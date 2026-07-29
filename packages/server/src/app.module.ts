import { Module } from '@nestjs/common';
import { createPool } from 'mysql2/promise';
import { env } from './env';
import { DB_POOL, RunService } from './pipeline/run.service';
import { PipelineController } from './pipeline/pipeline.controller';
import { CsvController } from './export/csv.controller';

@Module({
  controllers: [PipelineController, CsvController],
  providers: [
    {
      provide: DB_POOL,
      useFactory: () =>
        createPool({
          ...env.mysql,
          connectionLimit: 25,
          // Return DATETIME columns as strings, matching SQLite, so the two
          // executors are interchangeable.
          dateStrings: true,
        }),
    },
    RunService,
  ],
})
export class AppModule {}
