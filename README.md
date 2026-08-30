# EVRY Backend

API REST de EVRY con NestJS 12, PostgreSQL y Prisma 7. Expone la API canónica bajo `/api/v1`, mantiene `/api` como alias temporal y sirve medios locales en `/media/exercises`.

## Configuración segura

Copie `.env.example` a `.env` y complete valores propios; no publique ese archivo ni secretos. Al iniciar, la aplicación exige:

```dotenv
DATABASE_URL=postgresql://usuario:contrasena@host:puerto/base?schema=public
JWT_ACCESS_SECRET=<secreto-unico-de-al-menos-32-caracteres>
JWT_REFRESH_SECRET=<otro-secreto-unico-de-al-menos-32-caracteres>
PORT=4000
SWAGGER_ENABLED=false
```

Los secretos de acceso y refresh deben ser distintos, tener al menos 32 caracteres y no ser valores de ejemplo. Swagger es opt-in: solo se publica en `/docs` si `SWAGGER_ENABLED=true`. `CORS_ORIGIN`, `MEDIA_BASE_URL`, `JWT_ACCESS_TTL` y `JWT_REFRESH_TTL` son opciones adicionales de despliegue.

## Instalación y scripts

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run start:dev
```

La API local escucha en `http://localhost:4000/api/v1`. Se requieren Node 24.14.x y npm 11.x. Comandos disponibles:

```powershell
npm.cmd run lint:check
npm.cmd run lint:fix
npm.cmd run test:unit -- --runInBand
npm.cmd run test:db:migrate
npm.cmd run test:integration -- --runInBand
npm.cmd run build
npm.cmd audit --audit-level=high
```

## Base de pruebas aislada

Las pruebas de integración requieren `TEST_DATABASE_URL` con una base PostgreSQL marcada explícitamente como prueba y diferente de `DATABASE_URL`. El guard rechaza una URL ausente, no PostgreSQL, sin marcador de prueba o que identifica la misma base que el runtime. `test:db:migrate` valida esa separación antes de ejecutar Prisma y aplica migraciones únicamente a la URL de prueba.

Para integración use un runtime bloqueado y una base de prueba aislada, por ejemplo con estas formas de variables (reemplace los marcadores por secretos de prueba exclusivos):

```dotenv
TEST_DATABASE_URL=postgresql://usuario_prueba@127.0.0.1:55432/evry_test?schema=public
DATABASE_URL=postgresql://bloqueado@127.0.0.1:1/runtime_bloqueado
NODE_ENV=test
PORT=4000
SWAGGER_ENABLED=false
JWT_ACCESS_SECRET=<secreto-de-prueba-de-32-o-mas-caracteres>
JWT_REFRESH_SECRET=<otro-secreto-de-prueba-distinto-de-32-o-mas-caracteres>
```

## Autenticación y límites

Las rutas de registro, inicio de sesión y refresh usan límites específicos de 3, 5 y 10 solicitudes por minuto; el límite global es 100 por minuto. El refresh se almacena en una cookie `httpOnly`, `sameSite=lax`, con ruta `/api/auth` y `secure` en producción. Login normaliza el correo y responde de forma uniforme ante credenciales no válidas. La validación global elimina propiedades no permitidas y las rechaza.

## Errores y datos

Los filtros de Prisma normalizan conflictos, referencias, ausencias y problemas de conexión sin exponer SQL ni mensajes internos. Un problema de conexión responde como servicio no disponible, reintentable y con `Retry-After`.

El proceso se niega a iniciar si faltan la URL PostgreSQL, los dos secretos distintos, `PORT`, `SWAGGER_ENABLED` o `CORS_ORIGIN`. Prisma 7 usa `prisma.config.ts` para migraciones y el adaptador PostgreSQL en runtime.

## CI y staging

`.github/workflows/ci.yml` levanta PostgreSQL 17 aislado y ejecuta validate/generate, lint, build, pruebas unitarias, migraciones e integración. `render.yaml` define el servicio gratuito de staging y su health check. Como Render Free no ofrece pre-deploy separado, `prisma migrate deploy` se ejecuta antes de iniciar el proceso y es idempotente. Los valores `DATABASE_URL`, `CORS_ORIGIN` y `MEDIA_BASE_URL` deben configurarse en Render. Consulte `docs/operations/migration-runbook.md` antes de tocar datos conservados.

La migración `20260819090000_release_invariants` es expandible: añade campos nullable a sesiones y series, emite un reporte agregado de sesiones activas duplicadas, conserva la más reciente y marca las anteriores como canceladas. Después crea la unicidad parcial de una sesión activa por usuario, índices de consulta y la unicidad de `clientMutationId` por sesión. No elimina sesiones ni series.

## Catálogo y medios

El catálogo vendorizado contiene 1.324 ejercicios en `prisma/seed-data/exercises.json`, con miniaturas y GIF locales. Use:

```powershell
npm.cmd run exercises:verify
npm.cmd run exercises:import
npm.cmd run exercises:check-import
```

La atribución de Gym visual y sus condiciones de reutilización están en `NOTICE-MEDIA.md`; mantenga esa atribución al redistribuir medios.
