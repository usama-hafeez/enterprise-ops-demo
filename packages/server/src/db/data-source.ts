import { DataSource } from 'typeorm';
import { env } from '../env';
import { InitialSchema1753600000000 } from './migrations/1753600000000-initial-schema';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: env.mysql.host,
  port: env.mysql.port,
  username: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  // Schema changes go through migrations only - never synchronize.
  synchronize: false,
  migrations: [InitialSchema1753600000000],
  logging: false,
});
