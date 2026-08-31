const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { createOpenApiDocument } = require('../dist/openapi/openapi-document.js');
const { assertCompleteContract } = require('../dist/openapi/assert-complete.js');

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    app.setGlobalPrefix('api/v1');
    const document = createOpenApiDocument(app);
    assertCompleteContract(document);
    const { default: openapiTS, astToString } = await import('openapi-typescript');
    const client = astToString(await openapiTS(document, { defaultNonNullable: false }));
    writeFileSync(resolve(process.cwd(), 'openapi', 'evry-v1.json'), `${JSON.stringify(document, null, 2)}\n`);
    writeFileSync(resolve(process.cwd(), 'openapi', 'client.generated.ts'), client);
  } finally {
    await app.close();
  }
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
