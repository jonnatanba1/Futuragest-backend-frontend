import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global DTO validation — must match the pipe installed in every test
  // bootstrap (auth.int-spec.ts etc.); without it class-validator decorators
  // are inert in production.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // CORS — required for the web admin panel (the browser enforces it; the
  // Flutter app is native and unaffected). Origins are configurable via
  // CORS_ORIGINS (comma-separated); defaults cover the Vite dev + preview ports.
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173,http://futuragest-frontendweb-5pwypd-171cc5-5-252-52-113.sslip.io,https://futuragest.jjsoftech.com')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger / OpenAPI setup
  const config = new DocumentBuilder()
    .setTitle('FuturaGest API')
    .setVersion(process.env.npm_package_version ?? '0.0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  // Emit openapi.json to packages/contracts if GENERATE_OPENAPI=true
  // Used by: pnpm generate:openapi (runs in CI before contracts#generate)
  if (process.env.GENERATE_OPENAPI === 'true') {
    const fs = await import('fs');
    const path = await import('path');
    fs.writeFileSync(
      path.resolve(__dirname, '..', '..', 'packages', 'contracts', 'openapi.json'),
      JSON.stringify(document, null, 2),
    );
    console.log('openapi.json written to packages/contracts/openapi.json');
    await app.close();
    process.exit(0);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on port ${port}`);
}

bootstrap();
