import { MigrationInterface, QueryRunner } from 'typeorm';
import { TABLES_DROP_ORDER, compositeIndexes, tableDdl } from '@enterprise-ops/core';

/**
 * Initial schema. The DDL comes from the shared definition in
 * packages/core/src/db/schema.ts so MySQL, the SQLite browser demo, and the
 * tests can never drift apart. Composite indexes are part of the canonical
 * schema; the benchmark harness drops them for naive runs and recreates them.
 */
export class InitialSchema1753600000000 implements MigrationInterface {
  name = 'InitialSchema1753600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const ddl of tableDdl('mysql')) {
      await queryRunner.query(ddl);
    }
    for (const index of compositeIndexes) {
      await queryRunner.query(
        `CREATE INDEX ${index.name} ON ${index.table} (${index.columns.join(', ')})`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES_DROP_ORDER) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
