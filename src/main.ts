import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();
  await app.listen(Number(process.env.PORT ?? 3000));
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Application failed to start', error);
  process.exit(1);
});
