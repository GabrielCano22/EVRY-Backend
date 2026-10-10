# Rendimiento de la API: ensayo local reproducible

Estado: la última puerta local pasa sus 30 grupos, pero se conservan dos
ensayos adversos cuyas causas no están confirmadas. El resultado de
publicación/CI se consulta en GitHub; no es evidencia de aceptación desplegada.

## Diagnóstico y fallos posteriores — 9 de octubre de 2026

Se conservan ambos reportes adversos: `api-performance-qnOE6N` completa 30
grupos y cierra seis servidores, pero dos cotas superiores de confianza superan
500 ms; `api-performance-Clc3y4` termina durante el primer arranque, sin muestras.
Ninguno permite certificar el estado actual por sí solo. Los controles posteriores
de arranque/SQL no sustituyen el benchmark ni explican retrospectivamente esos fallos.

Una única ejecución completa con el diagnóstico nuevo termina con salida 0:
`api-performance-424bUg/report.json`, 30/30 grupos aceptados, seis servidores
cerrados, seis trazas completas y ningún error. Se mantuvieron todas las muestras,
repeticiones y límites. La mayor cota superior es 496,170 ms en historial c4/r2
frente a 500 ms: el margen es pequeño. Los ready observados tardan 4377–6276 ms,
fuera de las muestras calientes. No hubo cambio de implementación de latencia;
este resultado no prueba una corrección causal de los outliers ni invalida los
reportes adversos. No equivale a aceptación web, móvil o API desplegada.

La verificación completa posterior al parche compatible de Handlebars y a una
instalación limpia también pasa: `api-performance-2nSDTv/report.json`, 30/30
grupos, seis cierres, seis trazas y cero errores. La mayor cota es 361,436 ms,
conservando los límites originales. Este ensayo pertenece a la cadena local de
CI del lock actualizado; no es resultado de CI remota para el futuro commit.
Ambos reportes adversos anteriores siguen preservados y sin causa confirmada.

El runner ahora recoge `startupTraces` por proceso y `startupFailure` cuando
corresponde. Solo conserva fases permitidas, deduplicadas y tiempos del reloj
del padre. Clasifica deadline agotado, timeout, salida anterior a ready,
rechazo de inicialización y fallo de creación del proceso con códigos fijos.
También registra si la limpieza cerró correctamente y el código de salida;
no reemplaza la causa original por un error secundario de cleanup. Nunca añade
mensajes de excepción, stacks, tokens ni el contenido bruto de IPC al reporte.

El worker envía fases de importación, creación de aplicación y escucha solo
cuando el starter del benchmark activa `EVRY_BENCHMARK_STARTUP_TRACE=true` en
ese hijo. No debe configurarse globalmente: otros consumidores, incluido el
runner móvil, conservan ready como primer mensaje. Mensajes desconocidos o de
fase no cancelan ni renuevan el watchdog. Se conservan startup 30 s, cleanup
10 s/5 s, calentamiento 20, muestras 80 y todos los presupuestos de aceptación.
Las trazas de arranque quedan fuera de la latencia caliente.

La compilación debe terminar antes de abrir cualquier worker dependiente de
`dist`: un ensayo local reprodujo `MODULE_NOT_FOUND` por construir y arrancar
simultáneamente. Ese fallo de preparación se conserva y no se atribuye a la app.

Especificación: presupuestos del plan integral EVRY: API caliente p95 <500 ms
en consultas y <300 ms en mutaciones simples. No incluye despertar gratuito,
ni demuestra Core Web Vitals o rendimiento Android.

## Plan de ejecución

### Task 1: medición HTTP y estadística

- Implementar medición del cuerpo JSON completo con reloj monotónico.
- Solo permitir servidor HTTP en loopback; rechazar redirecciones.
- Separar calentamiento y muestras; conservar todas las latencias.
- Abortos, errores HTTP, JSON inválido o datos incorrectos invalidan el ensayo.
- Informar p50/p95/p99 por rango más próximo y límite superior unilateral
  del p95 con confianza mínima del 95%, mediante estadísticos de orden y
  distribución binomial. Sin suficientes muestras, no declarar aceptación.
- Pruebas reales con servidor HTTP local: calentamiento, concurrencia,
  validación de datos, errores y restricciones de origen.

Expected: pruebas RED→GREEN, lint y tipos sin errores.

### Task 2: aplicación real y dataset sintético

- Crear base UUID nueva en el clúster local de pruebas autorizado, sin
  reutilizar/vaciar tablas ni borrar bases existentes.
- Aplicar migraciones reales y crear catálogo de 2.648 ejercicios y 1.000
  sesiones completadas con 10.000 series deterministas.
- Arrancar AppModule/configureApp real en loopback, puerto efímero;
  autenticar mediante login móvil real.
- Medir catálogo paginado, overview, historial de ejercicio y mutaciones
  simples de perfil/readiness, con tres repeticiones independientes de 20
  calentamientos y 80 muestras por escenario a concurrencia 1 y 4;
  comprobar valores exactos en las respuestas. Cada repetición usa un proceso
  nuevo: las 100 solicitudes respetan el rate limit real, sin deshabilitarlo.
  No combinar muestras de procesos distintos para calcular confianza.
- Guardar reporte local sin credenciales: commit, sistema, fixture, muestras,
  presupuestos, límites de confianza, errores y advertencias metodológicas.
- Cerrar aplicación/conexiones incluso si falla el reporte; preservar base.

Expected: respuestas y conteos exactos; informe real. Un presupuesto fallido
es evidencia para optimizar, nunca motivo para relajar el umbral.

### Task 3: revisión, verificación y publicación

- Revisión independiente del rango completo y corrección de hallazgos
  importantes con regresiones RED→GREEN.
- Ejecutar gates locales backend correspondientes a CI, incluida integración
  PostgreSQL, migración y auditoría, antes del commit/push.
- Actualizar documentación con resultados reales y limitaciones. Mantener
  pendiente cualquier aceptación no demostrada.
- No publicar frontend mientras su auditoría de dependencias conocida falla.

Expected: CI backend verificada después del push, PR creado/actualizado;
sin despliegues, modificaciones remotas de infraestructura ni datos reales.

## Método y límites

La cota de confianza presupone muestras independientes de una distribución
estable. Cachés, carga concurrente y recursos compartidos pueden violarlo;
se informarán los grupos por separado, sin afirmar cumplimiento de SLA real.
El ordenamiento/rango se documenta explícitamente, pues existen diversas
convenciones de percentiles ([NIST](https://www.itl.nist.gov/div898/handbook/prc/section2/prc262.htm)).

Review Focus: redirects/orígenes no locales; errores ocultos; muestra y
calentamiento mezclados; confianza mal calculada; escenarios sin validar datos;
alteración/borrado de bases ajenas; fuga de credenciales; conexiones sin cerrar;
confusión entre ensayo de aplicación instrumentada y build/runtime de release.

## Ejecución

Usar únicamente el clúster local sintético autorizado. La URL debe contener
un marcador `test`, ser loopback y diferir de `DATABASE_URL`, incluso mediante
alias locales. Rechaza parámetros de conexión salvo `schema=public`.
El rol sintético necesita `CREATEDB`. No se usan `DROP`, resets ni limpieza:
cada ejecución conserva su nueva base y reporte para inspección.

```powershell
# Cargar las variables del entorno local sintético ya verificado.
npm run test:performance
# Alternativa sin Jest, mismo runner y aplicación compilada:
npm run benchmark:api
```

Los errores o presupuestos no demostrados devuelven código distinto de cero.
El reporte se guarda en `.worktrees/api-performance-*/report.json` y contiene
todas las observaciones, no tokens ni URLs con credenciales. CI ejecuta el
ensayo y conserva exclusivamente el JSON como artefacto durante siete días.
La instalación/migración de fixtures, login, arranque y calentamiento no se
mezclan con la latencia caliente. Esta no es una prueba de estrés que busque
el límite de capacidad, ni una prueba de resistencia prolongada.

## Primera línea base local — 1 de octubre de 2026

AppModule/configureApp compilado en proceso separado, PostgreSQL17.11 local,
2.648 ejercicios, 1.000 sesiones, 10.000 series. Tres repeticiones por
concurrencia (1 y 4), 20 calentamientos y 80 observaciones en cada escenario:
3.000 solicitudes de los escenarios, incluidas las de calentamiento, más seis
logins validados, sin errores.
Las 30 cotas de confianza pasaron. Se cerraron los seis procesos y todas las
conexiones; la base sintética permanece disponible.

| Escenario | Máximo p95 observado, ms | Máxima cota superior 95%, ms | Presupuesto, ms |
| --- | ---: | ---: | ---: |
| Catálogo de 30 | 25,99 | 27,45 | <500 |
| Overview, todo el historial | 210,71 | 298,52 | <500 |
| Historial de ejercicio, 20 sesiones | 296,64 | 376,71 | <500 |
| Actualizar perfil | 20,18 | 21,52 | <300 |
| Readiness diario | 25,72 | 29,25 | <300 |

Cada máximo se toma entre grupos independientes, sin juntar sus muestras.
Reporte local: `.worktrees/api-performance-HRJSKz/report.json`, aplicación
base `d5bbb2de9edab8db5f9b828db16426c0bd79fb48`. El ensayo de verificación
duró226,238s. No hay comparación antes/después de una optimización: esta es
la línea base. La concurrencia4 representa solicitudes simultáneas a la misma
cuenta sintética, no cuatro dispositivos físicos ni usuarios distintos.
La aceptación de API desplegada, redes externas, Web Vitals y Android
release sigue pendiente y no se deduce de este resultado.

El plazo operativo del runner es de20minutos, independiente del presupuesto
por solicitud. Un caso que cumple los presupuestos puede consumir alrededor
de788segundos solo en solicitudes; el plazo incluye migración y arranques.
Al agotarse, se abortan solicitudes, se cierran recursos y se escribe evidencia
fallida antes del watchdog externo (22minutos). Un proceso que no cierra
en10segundos recibe SIGKILL; se espera su salida y se invalida el ensayo.
La URL final resuelta debe mantener exactamente el origen loopback validado;
se rechazan caracteres de control antes de enviar credenciales.

Hallazgo menor diferido: el campo `commit` solo identifica HEAD; los ensayos
locales pueden incluir cambios no confirmados. En la primera línea base,
la aplicación compilada no cambió respecto a la base indicada, pero el runner
y sus pruebas aún estaban en desarrollo. No usar ese campo como fingerprint
completo de una copia de trabajo modificada.

Verificación posterior a la revisión:428 pruebas unitarias,36 regresiones de
medición/cierre, integración PostgreSQL83, ensayo de migración8, lint/tipos/
build/OpenAPI y auditoría0. Segunda ejecución real145,045s:
`.worktrees/api-performance-7zOwXd/report.json`,30 grupos aceptados,
consultas p95máximo245,64ms/cota303,58ms; mutaciones19,42ms/cota24,31ms.
Se comprobó la salida de los seis procesos; ambas bases sintéticas se
preservan. Los tres hallazgos importantes de revisión se corrigieron con
regresiones RED→GREEN; el hallazgo menor de fingerprint queda documentado.
