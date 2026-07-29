import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  await app.listen(env.serverPort);
  console.log(`server listening on :${env.serverPort}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
