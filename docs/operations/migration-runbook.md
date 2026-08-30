# Migración y recuperación de staging

Este procedimiento conserva usuarios, rutinas, sesiones, series, ciclo, readiness y catálogo. Nunca use `prisma migrate reset`, `db push --force-reset` ni una base de producción como base de pruebas.

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
pg_restore --clean --if-exists --no-owner --dbname evry_restore evry-before-migration.dump
```

Cambie `DATABASE_URL` a la base restaurada y vuelva a desplegar la última versión compatible. No restaure encima de la única copia existente.

