# Integración real de los contratos críticos

Este tramo ejecuta la hoja de ruta integral del usuario; no reemplaza su alcance ni declara lista la aplicación. Base: backend `f291aee`, frontend `f453516`.

## Global Constraints

- Conservar NestJS como monolito modular. No introducir microservicios.
- Access token solo en memoria; refresh web en cookie HttpOnly, con validación estricta de origen.
- Detectar reutilización de refresh token y revocar la familia de sesión.
- POST /api/v1/sync/workouts debe ser transaccional, idempotente y devolver revisión canónica; conflicto de revisión devuelve 409 con versión del servidor.
- Si existe otra sesión activa, no se mezcla automáticamente.
- No ejecutar migraciones destructivas ni reiniciar una base existente. Solo datos sintéticos en PostgreSQL aislado.
- No hacer merge ni despliegue en este tramo. El propietario autoriza checkpoints y pushes diarios a `codex/evry-optimization`; no autoriza merge a `main` ni despliegue. Render y Cloudflare quedan excluidos y cualquier despliegue futuro requerirá autorización explícita y se gestionará desde Vercel. Pruebas reales sin sustituir Prisma, autenticación, transacciones o SQL por mocks.

## Task 1: Autenticación real y configuración HTTP compartida

Ámbito de escritura: src/main.ts, nueva src/configure-app.ts, test/helpers/create-integration-app.ts, test/auth.integration-spec.ts, src/modules/auth y tests asociados; cambios puntuales en filtro API solo si una prueba lo requiere. No modificar sync ni schema/migraciones. No debilitar el contrato generado.

Extraer la configuración HTTP existente de main en una función compartida que main siga llamando, sin duplicar middleware en tests. Mantener media, cookies, API v1, alias /api, requestId, filtro uniforme, validación, CORS y Swagger opcional. Helper de integración usa AppModule real y esa configuración; la base debe pasar por el guard existente.

Añadir integración HTTP/PostgreSQL para registro y login web, cookies HttpOnly/secure cuando corresponde/path limitada, access token sin refresh en JSON, rotación y logout; login/refresh/logout móvil con tokens en JSON, rechazo de intercambio de plataforma, reutilización revocando familia sin tocar otra sesión válida. Verificar hashes en DB y que nunca se almacena el token sin hash. Añadir caso concurrente de refresh que pruebe que una colisión no devuelve 500 ni deja un descendiente válido después de detectar reutilización; usar sincronización determinista si hace falta, sin sleeps arbitrarios ni mocks de Prisma. Límites reales de login/registro/refresh devuelven error uniforme y Retry-After válido. Fixtures por test no deben saltarse límites globalmente.

Los endpoints web de escritura de autenticación (register/login/refresh/logout), incluidos alias /api, deben rechazar Origin ausente, null, malformado o no incluido exactamente en CORS_ORIGIN antes de producir cambios. Móvil continúa usando su contrato sin cookies y sin requerir Origin. No usar Referer como excepción ni confiar en CORS como protección CSRF. Reutilizar configuración validada, sin orígenes implícitos añadidos. Mantener mensajes de error uniformes con requestId. Origin permitido debe funcionar para web.

Escribir y observar pruebas fallidas antes de corregir fallos reales; pruebas de comportamientos existentes pueden pasar como caracterización. Si la concurrencia descubre P2034, resolverla dentro del protocolo de rotación/reutilización, no esconderla con 500 ni reintentos ciegos que omitan revocación. No exponer tokens en logs/reportes.

Verificar tests específicos mientras se itera; al terminar lint, test:type-check, test:unit, test:integration y build. Si cambia OpenAPI, regenerar artefactos en el mismo commit y reportarlo. Entregar commits locales y reporte con RED/GREEN, comandos exactos, conteos, límites y riesgos.

## Task 2: Sincronización real y rollback

Ámbito: nueva test/sync.integration-spec.ts y correcciones demostradas en src/modules/sync, con sus pruebas; usa el helper de Task1. No tocar autenticación.

Probar envío completo de una sesión finalizada offline y repetición exacta sin duplicar sesión/series/estadísticas; dos envíos simultáneos del mismo lote; dos dispositivos con misma revisión produciendo uno aceptado y otro 409; sesión activa distinta sin mezcla; update/delete/reordenamiento de series; ejercicio ajeno rechazado con rollback; conflicto de revisión de serie después de operaciones previas que revierte toda la transacción; bloqueo de ediciones completadas/canceladas; finalización vacía rechazada sin residuos. Comprobar resultados HTTP y filas reales, IDs, revisiones y cálculos literales de estadísticas. Usar datos únicos y limpiar solo IDs creados por el test.

Si se reproduce fallo, conservar el caso RED y corregir mínimo comportamiento necesario para cumplir plan. No sustituir tests por excepciones a la especificación. Verificar paquete completo una vez al cierre y revisión independiente.

## Task 3: Evidencia y seguimiento

Actualizar estado de implementación con los resultados efectivamente observados; verificar fuente OpenAPI y ambos clientes si cambia. Documentar comandos para PostgreSQL aislado, detener el cluster temporal al finalizar conservando datos y binarios. Mantener pendientes explícitos de migración poblada/restore, web/móvil, dispositivos, rendimiento y staging. No marcar el objetivo integral completo.
