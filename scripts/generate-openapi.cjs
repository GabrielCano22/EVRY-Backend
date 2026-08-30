const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { createOpenApiDocument } = require('../dist/openapi/openapi-document.js');

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  const document = createOpenApiDocument(app);
  writeFileSync(resolve(process.cwd(), 'openapi', 'evry-v1.json'), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
