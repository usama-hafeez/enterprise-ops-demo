import 'reflect-metadata';
import { AppDataSource } from './data-source';

AppDataSource.initialize()
  .then(async (dataSource) => {
    const applied = await dataSource.runMigrations();
    for (const migration of applied) {
      console.log(`applied: ${migration.name}`);
    }
    if (applied.length === 0) {
      console.log('schema up to date');
    }
    await dataSource.destroy();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
