# Task 2 — sesiones idempotentes y estadísticas reconstruibles

Fecha de verificación: 2026-08-23 (America/Bogota).

## Alcance y mapa de datos

| Flujo | Lectores | Writers | Propiedad/serialización |
| --- | --- | --- | --- |
| Crear o reanudar sesión | `Workout`, `Routine`, fase actual | `Workout` | La activa existente gana antes de validar un intento nuevo. `routineId` nuevo debe pertenecer al usuario. La carrera del índice parcial se recupera solo para el `P2002` esperado y se relee fuera del statement fallido. |
| Alta idempotente de serie | `Workout`, helper central de visibilidad de `Exercise`, clave `(workoutId, clientMutationId)` | `WorkoutSet` | UUID v4 obligatorio. Transacción Serializable y advisory xact lock común por `userId`. El `P2002` compuesto se captura fuera del callback abortado y devuelve la fila canónica. |
| PATCH/DELETE de serie y PATCH de workout | `WorkoutSet` + `Workout` o `Workout` | `WorkoutSet` / `Workout` | Solo propietario y sesión activa. Todas las mutaciones usan la misma transacción Serializable y lock de ciclo de vida. |
| Cancelar/finalizar | `Workout` y series ordenadas | `Workout` y, al finalizar, `ExerciseStat` | Cancelación y finalización son terminales e idempotentes en su propio estado. Compiten bajo el mismo lock. `P2034` reintenta la transacción completa, máximo tres intentos. |
| Eliminar histórico | `Workout` y ejercicios afectados | DELETE de un `Workout`, reemplazo de `ExerciseStat` | Se rechaza una activa. Finalizada/cancelada se elimina y reconstruye dentro de la misma transacción/lock. Devuelve `{ ok: true }`. |
| Reconstruir estadísticas | Sets útiles de workouts finalizados, no cancelados y no warmup | DELETE/CREATE solo del subconjunto `ExerciseStat` afectado | Usa exclusivamente el `tx` recibido y adquiere el lock común. Nunca incrementa ni conserva drift. |

Los detalles de sesión conservan relaciones usadas por el frontend y ordenan series por `order`, `completedAt` e `id`. Incluyen inicio, fin, cancelación, `clientMutationId`, ejercicio, peso, repeticiones, duración, RPE, técnica y calentamiento.

## Reglas implementadas

- Una serie útil para cerrar cumple `reps > 0 || durationS > 0`; peso aislado, ceros o solo RPE no bastan.
- Una sesión solo con warmup útil sí puede finalizar y cuenta como sesión completada, pero ese warmup no crea `ExerciseStat`.
- Sesiones finalizadas o canceladas son inmutables para alta/PATCH/DELETE de series y PATCH de workout.
- Estadísticas se reconstruyen desde fuente de verdad: sesiones distintas, último set, mejor carga, récord de repeticiones con peso nullable y 1RM Epley sin redondear; empates por fecha e ID más recientes.
- Sets warmup, workouts activos/cancelados y datos de otro usuario quedan fuera. Filas derivadas obsoletas desaparecen. Campos base sin récord quedan en cero, metadatos nuevos en null y `trendSlope` en cero.

## TDD rojo → verde

Se observaron fallos antes de producción:

- DTO: `clientMutationId` ausente/v1 era aceptado; peso negativo, `routineId`, técnica nullable y `isWarmup=null` incumplían el contrato.
- Sesión activa: no validaba propiedad de rutina ni recuperaba la carrera `P2002` esperada.
- Reintento/estadísticas: los módulos todavía no existían.
- Migración: no existían campos ni SQL expand/backfill/verify.
- Servicio/integración: faltaban dependencia de stats, cancelación, inmutabilidad, rutas y carreras.

Verde final del alcance:

- 42 pruebas unitarias en 6 suites (`src/modules/workouts` + migración estática).
- 123 pruebas unitarias totales en 27 suites del backend.
- 11 pruebas HTTP/PostgreSQL de workouts: inicios y sets simultáneos, visibilidad/propiedad, finish/cancel, rollback de stats, borrado histórico y carreras set↔finish, update/delete↔finish, finish↔cancel y finish/delete/doble delete.
- 21 pruebas de integración totales en 3 suites.

## Migración real, checksum y convergencia

Base aislada: `127.0.0.1:55432/evry_test`; no existe `.env` en el worktree y se usaron variables explícitas. `DATABASE_URL` de runtime quedó bloqueada y distinta durante los runners protegidos.

Preflight confirmado: exactamente cinco migraciones finalizadas y ninguna revertida. Antes de regenerar Prisma Client se conservaron fixtures:

- 2 usuarios `task2-migration-*`.
- 4 ejercicios.
- 8 workouts (finalizados, cancelado, activo y warmup-only).
- 9 sets (trabajo, warmup, duración, cancelado, activo y otro usuario).
- 2 stats deliberadamente corruptos/obsoletos antes del backfill.

La sexta migración `20260819130000_exercise_stat_records` se aplicó con `test:db:migrate`. SHA-256 del archivo y checksum de `_prisma_migrations`:

`a7560439c6c3d563435f7ed6b14bcc31e2a0401e8a234af320c25d57bd0c7122`

Evidencia posterior:

- 6 columnas nuevas presentes.
- Datos fuente preservados: 2 usuarios, 4 ejercicios, 8 workouts y 9 sets.
- Fuerza exacta: `estimated1RM=114`, `bestWeight=100`, `bestReps=20`, `sessionsCount=3`; los tres récords provienen de sets distintos.
- Duración: valores base en cero, metadatos de récord null y una sesión.
- Activa/cancelada/warmup excluidas; fila obsoleta eliminada.
- Tras corromper dos stats derivados, se ejecutó por segunda vez el mismo SQL completo con `prisma db execute`; el `expected_stats` materializado y los `EXCEPT` bidireccionales restauraron exactamente el resultado anterior con el mismo checksum.

La migración hace expand → materialización determinista → reemplazo → verificación dentro de un único `BEGIN/COMMIT`. No modifica migraciones anteriores ni borra `Workout`/`WorkoutSet`. Después del `COMMIT` solo hay comentarios con los seis `ALTER TABLE ... DROP COLUMN IF EXISTS`; el rollback es exclusivamente manual tras backup/revisión. No se realizó despliegue.

## Puertas ejecutadas

Todas finalizaron con código 0:

| Comando | Resultado |
| --- | --- |
| `npm.cmd run test:db:migrate` | 6 migraciones; ninguna pendiente. |
| `npm.cmd run prisma:generate` | Prisma Client 5.22.0 generado. |
| `npm.cmd run test:unit -- --runInBand src/modules/workouts src/prisma/exercise-stat-migration.spec.ts` | 6 suites, 42 pruebas verdes. |
| `npm.cmd run test:unit -- --runInBand` | 27 suites, 123 pruebas verdes. |
| `npm.cmd run test:integration -- --runInBand --testPathPattern=workouts` | 1 suite, 11 pruebas verdes. |
| `npm.cmd run test:integration -- --runInBand` | 3 suites, 21 pruebas verdes. |
| `npm.cmd run lint:check` | 0 errores, 0 warnings. |
| `npm.cmd run build` | Compilación Nest exitosa. |
| `git diff --check` | Sin errores. |

`NODE_NO_WARNINGS=1` se usó únicamente para silenciar deprecaciones de dependencias de Node; no modifica ni oculta resultados de Jest, Prisma, ESLint o TypeScript.

## Identidad Git y estado

- Base verificada antes de editar: `3ed813a1894ae3eaa54caf40e477072eb2d5dfda`.
- Commit único requerido: `feat: completar sesiones idempotentes y estadisticas`.
- El SHA final se informa con `git rev-parse HEAD` en el handoff posterior al commit; no se auto-incrusta aquí porque alterar este archivo cambiaría el propio SHA.
- Fixtures `task2-migration-*` permanecen en PostgreSQL para revisión. La integración limpia exclusivamente los IDs aleatorios que crea.
- No se hizo push ni despliegue. El estado limpio se verifica después del commit.
