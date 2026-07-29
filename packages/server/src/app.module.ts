import { Module } from '@nestjs/common';
import { createAppPool } from './db/pool';
import { DB_POOL, RunService } from './pipeline/run.service';
import { PipelineController } from './pipeline/pipeline.controller';
import { CsvController } from './export/csv.controller';

@Module({
  controllers: [PipelineController, CsvController],
  providers: [
    {
      provide: DB_POOL,
      useFactory: () => createAppPool(),
    },
    RunService,
  ],
})
export class AppModule {}
