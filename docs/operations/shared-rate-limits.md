# Límites de solicitudes compartidos

Estado — 12 de octubre de 2026, 22:00 Bogotá: la corrección de precisión/reloj
pasa las ocho regresiones reales de cuotas y todas las puertas locales:
458 unitarias, 93 integraciones, nueve ensayos de migración/recuperación,
Prisma, contrato, lint, tipos, build y auditoría de nivel alto (20 moderadas
pendientes). `api-performance-pZmHgo` acepta los 30 grupos, con límites,
muestras, guards y confianza originales; no sustituye CI remota ni aceptación
integral. Su campo HEAD identifica la base, no los cambios locales sin commit.

El checkpoint anterior `9b79c78` tuvo push CI verde y PR CI roja por
Retry-After 61; esos resultados no certifican la corrección nueva.
Se conservan los ensayos adversos `DdWdOB` y `olCW0R`, sin descartar muestras
ni relajar presupuestos. No se ha desplegado ni modificado datos reales.

## Brecha reproducida y corrección local

El guard anterior guardaba cuotas en un `Map` por instancia. Reiniciar el proceso
o distribuir intentos entre dos instancias reiniciaba o multiplicaba el límite.
La prueba inicial falló con diez intentos admitidos donde se requerían cinco.
Después del cambio admite cinco y rechaza siete de doce intentos concurrentes.
Los cuatro casos adicionales verifican una nueva aplicación independiente, reloj adelantado/contador
acotado, vencimiento/conservación de cuota activa y fallo cerrado/liveness.
Un sexto caso verifica eliminación real de una cuota vencida y conservación
de otra activa agotada durante la limpieza.
Además, expulsar claves activas para acotar ese `Map` podía restituir cuotas.

La corrección conserva los límites de registro (3), login (5), refresh (10)
y rutas generales (100), con ventana de 60 segundos, errores 429 y Retry-After.
PostgreSQL guarda únicamente una clave hash de cliente/ruta, contador y
vencimiento. No guardar emails, tokens, contraseñas, notas ni IP en claro.
No se añadirá Redis, otra base remota ni un servicio de pago.

La actualización es atómica mediante `INSERT ... ON CONFLICT DO UPDATE`,
usando el reloj de PostgreSQL para que relojes distintos en las instancias no
restituyan una cuota. La concurrencia se verifica con solicitudes HTTP reales
contra dos aplicaciones independientes, no con un contador simulado.
[UPSERT de PostgreSQL](https://www.postgresql.org/docs/17/sql-insert.html),
[reloj de PostgreSQL](https://www.postgresql.org/docs/17/functions-datetime.html).

La limpieza, como máximo una vez por minuto por instancia, borra hasta 1.000
cuotas vencidas con `SKIP LOCKED`, sin expulsar cuotas activas. El reloj de
la aplicación solo programa esa limpieza: no determina admisión o vencimiento.
Los intentos denegados saturan el contador en `límite + 1`, evitando crecimiento
ilimitado. No hay fallback en memoria que permita eludir un límite agotado.

Dos regresiones posteriores reprodujeron el fallo sin depender de una carrera
aleatoria: el vencimiento de una ventana que empieza en `.000501` se redondeaba
a milisegundos, dando 60,000499 segundos; además una actualización bloqueada
calculaba el tiempo restante desde su llegada, no desde la respuesta posterior
al bloqueo. Ambos casos devolvían 61. Ahora `resetAt` conserva microsegundos
mediante una migración adicional `TIMESTAMPTZ(6)`, sin cambiar vencimientos ni
contadores existentes, y Retry-After usa `clock_timestamp()` después de la
espera. No se trunca el TTL, limita artificialmente el resultado, restituye una
cuota ni amplía la aserción. Las decisiones de admisión siguen usando el reloj
DB y el upsert atómico. [Precisión temporal](https://www.postgresql.org/docs/17/datatype-datetime.html),
[relojes de sentencia y tiempo actual](https://www.postgresql.org/docs/17/functions-datetime.html).

El error recuperable 503 del almacén está descrito en OpenAPI para las rutas
afectadas; `/health/live` no requiere ese almacén. Los clientes se regeneran
desde el contrato, sin introducir tipos de error manuales por plataforma.

El primer benchmark con cuotas compartidas falló en la segunda repetición de
historial: su cuota retenida llegó a 101, después de siete grupos aprobados.
Se conserva `api-performance-TgFFX3/report.json` como ensayo fallido, no como
aceptación. El runner ahora espera el vencimiento real en la base de su fixture
antes de cada repetición, fuera del calentamiento y de las muestras. No borra
cuotas, inventa clientes nuevos, reintenta 429 ni descarta solicitudes fallidas.
Mantiene 20 calentamientos, 80 muestras, seis procesos, 30 grupos, watchdog y
límites de 500/300 ms. Los tiempos de espera quedan separados en `quotaWaits`.

## Compatibilidad y datos

1. Añadir una tabla nueva e índice de vencimiento; no reescribir tablas de usuario.
2. Aplicar la expansión únicamente a la nueva base local explícita de pruebas.
3. Verificar migración poblada y recuperación antes de cualquier publicación.
4. Instancias antiguas pueden leer los datos existentes después de la expansión,
   pero la garantía de cuota compartida requiere que todas estén actualizadas.
5. Rollback de código deja la tabla nueva intacta. No borrar ni contraer el esquema.

No aplicar esta migración a datos reales ni a una base remota en esta fase.

## Pruebas exigidas

- Doce intentos concurrentes desde el mismo cliente en dos aplicaciones:
  exactamente cinco llegan a autenticación y siete son rechazados con 429.
- Cabeceras `X-Forwarded-For` distintas no cambian la cuota sin un proxy confiable.
- Otro cliente tiene su propia cuota, mientras reiniciar una instancia no la borra.
- Vencimiento permite una nueva ventana y Retry-After se calcula con el reloj DB.
- Una ventana de 60 s conserva esa duración para un inicio sub-milisegundo.
- Retry-After excluye el tiempo pasado esperando un bloqueo real de otra conexión.
- No hay contador creciente sin límite ni eliminación de cuotas activas al limpiar.
- Error del almacén falla cerrado; `/health/live` conserva independencia de la DB.
- Suite completa, contrato sin cambios inesperados, migración y presupuesto API.

Los fixtures usan direcciones reservadas distintas por aplicación cuando deben
estar aislados, y una dirección compartida explícita cuando prueban concurrencia.
Esa sustitución del transporte existe solo en el helper de pruebas; producción
no confía automáticamente en ninguna cabecera aportada por un cliente.
