import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
