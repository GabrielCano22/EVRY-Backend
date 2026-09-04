# Integración local con PostgreSQL sintético

Actualizado: 4 de septiembre de 2026.

Esta guía ejecuta las pruebas de integración contra un clúster PostgreSQL local **sintético y aislado**. Nunca copie una URL de producción ni reutilice la base de runtime. No incluye `prisma migrate reset`, `DROP DATABASE`, restauraciones ni semillas de datos reales.

## Prerrequisitos y barreras

- Node 24.14 y las dependencias del backend ya instaladas.
- Un clúster PostgreSQL local sintético, inicialmente vacío o ya dedicado a estas pruebas, listo para aceptar conexiones.
- Una base de prueba con nombre explícito de prueba, por ejemplo `evry_contract_test`, y una cuenta local sin datos reales.
- `TEST_DATABASE_URL` debe ser la URL de esa base sintética. `DATABASE_URL` debe ser una URL runtime deliberadamente bloqueada y **distinta**. El guard de pruebas rechaza que sean iguales.
- Los secretos de abajo son fixtures de prueba; no use secretos, usuarios, hosts ni URLs reales.

## Preparar un clúster portátil (solo si ya se dispone de binarios PostgreSQL)

Sustituya los marcadores por rutas locales de un directorio temporal dedicado. Estos comandos no borran el directorio, sus binarios ni sus datos; no inicialice sobre un directorio que contenga datos que quiera preservar.

```powershell
$pgBin = 'C:\ruta\a\PostgreSQL\bin'
$pgData = 'C:\ruta\temporal\evry-contract-pgdata'
$pgPort = 55437

# Primera vez, únicamente sobre un directorio nuevo y sintético:
# & "$pgBin\initdb.exe" -D $pgData -U evry_test_admin -A trust

# Iniciar un clúster sintético ya preparado:
& "$pgBin\pg_ctl.exe" -D $pgData -o "-h 127.0.0.1 -p $pgPort" -w start

# Cree la base una sola vez si aún no existe:
# & "$pgBin\createdb.exe" -h 127.0.0.1 -p $pgPort -U evry_test_admin evry_contract_test
```

Cuando termine, preserve los datos y binarios y detenga solo ese clúster temporal:

```powershell
& "$pgBin\pg_ctl.exe" -D $pgData -m fast -w stop
```

## Configurar el entorno sintético

Desde la raíz de `EVRY-Backend`, defina exactamente una URL de prueba y una URL runtime bloqueada. La migración y las pruebas sustituyen internamente la URL runtime por `TEST_DATABASE_URL` después de que el guard valida la separación.

```powershell
$env:TEST_DATABASE_URL='postgresql://evry_test_admin@127.0.0.1:55437/evry_contract_test'
$env:DATABASE_URL='postgresql://blocked@127.0.0.1:1/evry_runtime'
$env:NODE_ENV='test'
$env:JWT_ACCESS_SECRET='evry-test-access-secret-with-at-least-32-characters'
$env:JWT_REFRESH_SECRET='evry-test-refresh-secret-with-at-least-32-characters-different'
$env:CORS_ORIGIN='http://localhost:3000'
$env:PORT='4000'
$env:SWAGGER_ENABLED='false'
```

Verifique y genere Prisma, y aplique únicamente las migraciones existentes a esa base sintética:

```powershell
npm run prisma:validate
npm run prisma:generate
npm run test:db:migrate
```

`test:db:migrate` ejecuta `prisma migrate deploy`; no hace reset. No ejecute `prisma migrate dev`, `prisma migrate reset`, seed, restore o comandos destructivos como parte de esta guía.

## Ejecutar integración

```powershell
# Foco reproducible de sincronización: HTTP real, AppModule real y PostgreSQL sintético.
npm run test:integration -- --runInBand test/sync.integration-spec.ts

# Suite completa de integración contra la misma base sintética.
npm run test:integration
```

La suite de sync crea fixtures aleatorios con prefijo propio y los limpia al cerrar. Aun así, el aislamiento de la URL es obligatorio: no convierta una base compartida o de producción en objetivo de estas pruebas.

La prueba focal comprueba 10 casos, incluidos idempotencia, carreras de entrega y revisión, conflicto de sesión activa, rollback, estados terminales y estadísticas. Para las carreras, la barrera toma el advisory lock de ciclo de vida y verifica en `pg_locks` los waiters de la identidad exacta: OID de la base, `classid`, `objid`, `objsubid` y PID. No es una prueba de carga, restauración ni múltiples procesos de aplicación.

## Evidencia actual y límites

El 4 de septiembre de 2026, la integración completa pasó 7 suites / 60 pruebas en 60,48 s contra PostgreSQL sintético. El foco de sync pasó 10/10 y una revisión independiente aprobó la identidad completa del advisory lock. La única salida adicional conocida fue la advertencia de Jest sobre VM Modules experimental.

No se ejecutó migración sobre base poblada, backup/restauración, restauración de datos ni pruebas de rendimiento. Detenga el clúster temporal con el comando anterior al finalizar, sin borrar sus archivos.
