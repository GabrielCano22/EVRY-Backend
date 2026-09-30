# Migración y recuperación (sin despliegue autorizado)

Este procedimiento conserva usuarios, rutinas, sesiones, series, ciclo, readiness y catálogo. Nunca use `prisma migrate reset`, `db push --force-reset` ni una base de producción como base de pruebas. El ensayo automatizado usa únicamente datos sintéticos locales; no autoriza migraciones, backups ni despliegues sobre datos reales o servicios externos.

## Puerta automatizada sobre una base poblada

Desde la raíz del backend, con el clúster sintético iniciado y las variables de
la [guía de integración](integration-tests.md), ejecute:

```powershell
# Solo si pg_dump/pg_restore 17 no están en PATH:
$env:PG_BIN_DIRECTORY='C:\ruta\a\PostgreSQL\17\bin'
npm run test:migration
```

Se requiere una cuenta de pruebas con permiso `CREATEDB`. Se rechazan hosts no
loopback, el mismo destino runtime (también mediante alias localhost/IPv6) y
parámetros de conexión que puedan cambiar el destino; solo se admite
`schema=public`. No use credenciales reales.

La suite crea seis bases con UUID y prefijo `evry_migration_test_`, sin borrar
ni sobrescribir bases existentes. Aplica con **Prisma migrate deploy** las cuatro
migraciones históricas hasta `20260813190000_add_routine_series_plan`, inserta
fixtures y exporta un archivo custom con `pg_dump`. Después aplica todas las
migraciones confirmadas y compara cada campo original y todas las relaciones.

Los ocho casos verifican:

- Preservación de 34 filas fuente: 2 usuarios, 3 ejercicios, 2 rutinas,
  3 elementos de rutina, 6 sesiones, 9 series, 2 entradas de ciclo,
  5 readiness y 2 refresh tokens. Incluyen atribución, planes JSON,
  propietario del ejercicio, valores nulos, fechas y notas.
- Conversión determinista de sesiones completadas/activas/canceladas,
  incluida la selección de la sesión más reciente con empate de fecha.
  Las sesiones desplazadas y sus series se conservan.
- Readiness en la frontera 04:59/05:00 UTC de Bogotá: el último registro
  diario adquiere fecha civil; los duplicados heredados permanecen recuperables.
- Reconstrucción de estadísticas desde series fuente: 2 sesiones de fuerza,
  peso máximo 80 kg, 12 repeticiones y e1RM 98 kg; una sesión temporizada.
  No cuentan calentamientos, borradores ni series sin datos útiles.
- Restricciones reales de sesión activa, ejercicio/orden de rutina,
  orden de serie y readiness diario: PostgreSQL rechaza duplicados sin
  modificar filas existentes.
- Restauración del backup **anterior** en una base nueva con igualdad completa,
  seguida de migración; restauración del backup **posterior** con igualdad
  completa, y repetición idempotente de `migrate deploy`. La suite HTTP completa
  (AppModule/Supertest/PostgreSQL) se ejecuta también contra la copia poblada
  restaurada; después se vuelve a comprobar que conserva todas sus filas.
- Tres ensayos separados de duplicados heredados (ejercicio de rutina,
  orden de rutina y orden de serie): la expansión offline aborta y revierte
  sus columnas, conservando las filas para limpieza revisada.

Prisma puede ocultar la excepción original de un bloque `BEGIN` con
`current transaction is aborted` y dejar `logs` nulo. La prueba comprueba
el fallo de deploy, su historial inconcluso, la reversión y la conservación;
también ejecuta el mismo SQL publicado para verificar la causa específica.
Ante ese error, inspeccione duplicados antes de reintentar; no use reset,
no marque la migración como aplicada y no elimine registros automáticamente.

Los dumps anterior/posterior, índice del archivo anterior, configuración de
baseline y nombres de las bases quedan en `.worktrees/migration-rehearsal-*/`.
Se conservan incluso tras fallos. La CI usa los binarios 17 del propio servicio
PostgreSQL mediante Docker y guarda estos artefactos sintéticos siete días.
La cuenta del ensayo no migra la base indicada por `TEST_DATABASE_URL`: esta
solo permite crear nuevas bases de fixtures en el mismo clúster local.

**Límites:** este ensayo no reemplaza el backup autorizado y la revisión de
inconsistencias de la base real antes de una migración futura. No prueba
restauración de infraestructura, volúmenes grandes ni el presupuesto p95.

## Ensayo previo

1. Detenga escrituras o anuncie una ventana de mantenimiento.
2. Exporte una copia verificable:

   ```bash
   pg_dump --format=custom --no-owner --file evry-before-migration.dump "$DATABASE_URL"
   pg_restore --list evry-before-migration.dump > evry-before-migration.contents.txt
   ```

3. Restaure el dump en una base temporal y ejecute `npm ci`, `npm run prisma:validate`, `npm run prisma:generate` y `npm run prisma:deploy` apuntando únicamente a esa copia.
4. Compare conteos de `User`, `Routine`, `RoutineExercise`, `Workout`, `WorkoutSet`, `CycleEntry`, `Readiness` y `Exercise`. Verifique también huérfanos y más de una sesión `ACTIVE` por usuario.
5. Ejecute unitarias, integración y los escenarios de sincronización/reintento sobre la copia.

## Despliegue expand/contract

1. Confirme que el backup puede listarse y restaurarse.
2. Ejecute sólo migraciones confirmadas con `npm run prisma:deploy`.
3. Despliegue el backend dual (`/api/v1` y alias temporal `/api`), luego web y Android.
4. Verifique `/api/v1/health/live`, `/api/v1/health/ready`, login/refresh, creación y finalización de una sesión, reintento idempotente y métricas.
5. Retire el alias antiguo sólo en una entrega posterior, cuando ambos clientes confirmados usen `/api/v1`.

## Restauración

Si una validación falla, detenga escrituras, conserve la base fallida para análisis y restaure en una base nueva:

```bash
createdb evry_restore
pg_restore --exit-on-error --single-transaction --no-owner --dbname evry_restore evry-before-migration.dump
```

Cambie `DATABASE_URL` a la base restaurada y vuelva a desplegar la última versión compatible. No restaure encima de la única copia existente.
