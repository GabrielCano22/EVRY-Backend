# Task 2 — Sincronización PostgreSQL real y rollback

Base revisada: `2cbed123e03ea97009e5660fbcac267a5186a3e4` en `codex/evry-optimization`.

## Alcance entregado

Se añadió `test/sync.integration-spec.ts`, usando `createIntegrationApp` de Task 1,
el `AppModule` real, HTTP autenticado y PostgreSQL aislado. Cada fixture usa prefijo
aleatorio y UUIDs propios; el cleanup elimina exclusivamente usuarios y ejercicios
creados por la suite (los workouts, series y estadísticas se eliminan por cascada del
usuario).

Los diez casos cubren: finalización offline e idempotencia; doble entrega simultánea;
dos revisiones simultáneas con el `409` y versión canónica; segunda sesión activa;
update/delete/reordenamiento; ejercicio privado ajeno y rollback; conflicto tardío de
revisión y rollback transaccional; inmutabilidad COMPLETED/CANCELLED; y finalización
vacía sin filas ni estadísticas. Las comprobaciones combinan HTTP, IDs, revisiones,
filas reales de `Workout`/`WorkoutSet` y cálculos literales de `ExerciseStat`.

No se cambió `src/modules/sync`: los contratos ya estaban implementados por la base
entregada y todos los comportamientos ejercitados se verificaron verdes contra la base
sintética.

## RED / GREEN

RED de infraestructura (sin datos tocados): ejecutar la integración con `DATABASE_URL`
igual a `TEST_DATABASE_URL` fue rechazado por el guard deliberado de seguridad con
`TEST_DATABASE_URL must be different from DATABASE_URL.` Se corrigió únicamente la
invocación para usar una URL runtime bloqueada; el setup la reemplaza por la URL de
prueba antes de inicializar Prisma.

El primer ejercicio funcional de la nueva suite fue GREEN, por lo que actúa como
caracterización y protección de comportamiento existente; no hubo fallo demostrado que
autorizara una corrección de producción. Se ajustó el caso de sesión activa antes de su
ejecución final para afirmar explícitamente el `409 ACTIVE_WORKOUT_CONFLICT`, no una
coexistencia de sesión terminada.

### Corrección de revisión 1

Las dos carreras ahora retienen el mismo advisory lock de ciclo de vida que usa Sync,
esperan que PostgreSQL exponga dos transacciones bloqueadas y solo después liberan la
barrera. La primera versión de esta prueba quedó RED porque los objetos de Supertest no
inician la solicitud hasta que se esperan; se corrigió el helper de prueba para iniciarla
antes de observar los waiters. La barrera real quedó GREEN sin `P2034`, `500` ni cambio
de producción. Los casos de ejercicio ajeno y sesión terminal también validan el error
uniforme (`code`, `retryable: false` y `requestId`) además de HTTP y filas.

### Corrección de revisión 2

La espera ya no cuenta actividad advisory global ni usa el texto de la consulta como
señal. El cliente que retiene la barrera lee la identidad exacta de su lock concedido
(`classid`, `objid`, `objsubid` y PID); el observador cuenta en `pg_locks` solo locks no
concedidos de esa identidad, exige igualdad exacta con el número esperado y verifica que
los PIDs waiters sean únicos y distintos del dueño. Si expira, el diagnóstico enumera
solamente los locks de esa identidad. La variante pasó focal sin cambio productivo.

## Comandos y resultados

Las integraciones se ejecutaron con:

```powershell
$env:TEST_DATABASE_URL='postgresql://evry_test_admin@127.0.0.1:55437/evry_contract_test'
$env:DATABASE_URL='postgresql://blocked@127.0.0.1:1/evry_runtime'
$env:NODE_ENV='test'
$env:JWT_ACCESS_SECRET='evry-test-access-secret-with-at-least-32-characters'
$env:JWT_REFRESH_SECRET='evry-test-refresh-secret-with-at-least-32-characters-different'
$env:CORS_ORIGIN='http://localhost:3000'
$env:PORT='4000'
$env:SWAGGER_ENABLED='false'
npm run test:integration -- --runInBand test/sync.integration-spec.ts
```

Resultado focal: 1 suite, 10 pruebas aprobadas.

Tras la corrección de revisión 1, el mismo comando focal volvió a aprobar 1 suite y 10
pruebas con las dos barreras PostgreSQL activas.

Tras la corrección de revisión 2, volvió a aprobar 1 suite y 10 pruebas con los waiters
identificados por la identidad exacta del advisory lock.

Verificación de cierre:

```powershell
npm run lint
npm run test:type-check
npm run test:unit -- --testPathIgnorePatterns=integration
npm run test:integration
npm run build
git diff --check
```

Resultados observados: lint sin advertencias; type-check correcto; unitarias 53 suites,
308 pruebas aprobadas; integración 7 suites, 60 pruebas aprobadas; build correcto;
`git diff --check` sin espacios o errores de parche.

## Revisión y riesgos

La revisión de alcance confirmó que el diff solo añade la prueba y este reporte: no
modifica auth, Prisma schema/migraciones, ni otro dominio. No se hicieron push ni
migraciones, y los únicos datos escritos fueron fixtures de la base PostgreSQL aislada.

Riesgo residual: la barrera controla dos solicitudes y el lock del ciclo de vida, no una
matriz de carga sostenida ni múltiples procesos de aplicación. El contrato queda cubierto
a nivel HTTP/BD; una futura prueba de estrés puede ampliar cardinalidad y número de
dispositivos sin cambiar esta garantía funcional.

### Corrección de revisión 3

La identidad capturada del advisory lock ahora incluye también el OID de base de
datos (`pg_locks.database`), junto con clase, objeto, sub-objeto y PID. Las consultas
de espera y diagnóstico exigen igualdad de los cuatro componentes de identidad,
evitando contar waiters no concedidos de otra base del mismo clúster. Se conservaron
el conteo exacto de waiters, los PIDs distintos y la exclusión del PID dueño.

## Comandos y resultados de la corrección 3

Prueba focal ejecutada contra PostgreSQL sintético (la URL runtime es distinta y
bloqueada, sin resets ni migraciones):

```powershell
$env:TEST_DATABASE_URL='postgresql://evry_test_admin@127.0.0.1:55437/evry_contract_test'
$env:DATABASE_URL='postgresql://blocked@127.0.0.1:1/evry_runtime'
$env:NODE_ENV='test'
$env:JWT_ACCESS_SECRET='evry-test-access-secret-with-at-least-32-characters'
$env:JWT_REFRESH_SECRET='evry-test-refresh-secret-with-at-least-32-characters-different'
$env:CORS_ORIGIN='http://localhost:3000'
$env:PORT='4000'
$env:SWAGGER_ENABLED='false'
npm run test:integration -- --runInBand test/sync.integration-spec.ts
```

Salida exacta relevante:

```text
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        80.221 s
Ran all test suites matching test/sync.integration-spec.ts.
```

Verificación de tipos:

```powershell
npm run test:type-check
```

Salida exacta:

```text
> evry-backend@0.1.0 test:type-check
> tsc --noEmit -p tsconfig.spec.json
```

El proceso terminó con código 0.

## Auto-revisión de la corrección 3

- El diff queda limitado a `test/sync.integration-spec.ts` y este reporte.
- No hay cambios de producción, autenticación, esquema Prisma, migraciones,
  infraestructura, resets ni push.
- El OID de base se captura del lock concedido y se aplica en las consultas de
  waiters y diagnóstico; se mantienen las aserciones de cardinalidad y PID.
- No quedan preocupaciones conocidas dentro del alcance de esta revisión.
