# Preparación de staging en Vercel

Estado: preparación local, **no desplegado**. El propietario autorizó explícitamente
Vercel el 12 de octubre de 2026 y priorizó web, después APK; iOS queda diferido.
El despliegue se preparará en el equipo Hobby con una base de prueba nueva y
separada. No se importarán ni modificarán datos conservados, ni se contratarán
planes de pago o dominios. Render y Cloudflare siguen excluidos. Esta autorización
no demuestra que las puertas de seguridad, compatibilidad o QA estén superadas.

## Arquitectura conservada

Mantener Next.js y el monolito NestJS como proyectos separados dentro de Vercel.
El backend ya tiene `src/main.ts`, uno de los puntos de entrada reconocidos por
Vercel. No requiere convertir todos sus controladores a funciones ni reemplazar
Express; la documentación oficial muestra `NestFactory.create` y `app.listen`
para este caso. Esto no demuestra que EVRY haya superado una compilación de la
plataforma. [NestJS en Vercel](https://vercel.com/docs/frameworks/backend/nestjs).

La web procede del repositorio EVRY, con raíz de proyecto `apps/web` y acceso
a los paquetes compartidos y al lockfile de la raíz del monorepo. El backend
procede de EVRY-Backend con raíz del repositorio.
[Monorepos en Vercel](https://vercel.com/docs/monorepos).

Usar Node.js 24, no Edge. El desarrollo y CI están fijados a 24.14; comprobar
la versión efectiva de compilación/runtime del proveedor antes de aprobar la
compatibilidad, sin asumir que se conserva el mismo parche.
[Versiones de Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Configuración que deberá concretarse antes del despliegue

| Componente | Configuración |
| --- | --- |
| API | `DATABASE_URL`: PostgreSQL separado de producción, con TLS y conexión agrupada; ningún valor real en Git |
| API | `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`: distintos, aleatorios, al menos 32 caracteres; nunca los secretos de tests |
| API | `JWT_ACCESS_TTL=15m`, `JWT_REFRESH_TTL=30d` |
| API | `NODE_ENV=production`, `SWAGGER_ENABLED=false`, `PORT` válido según el runtime |
| API | `CORS_ORIGIN`: orígenes HTTPS exactos autorizados, sin comodines ni previews arbitrarias |
| API/medios | `MEDIA_BASE_URL`: origen HTTPS que efectivamente sirva el catálogo conservado |
| Web | `NEXT_PUBLIC_API_BASE_URL`: URL de staging configurada **antes de compilar**, nunca localhost |
| Móvil | `EXPO_PUBLIC_API_BASE_URL`: URL de staging únicamente en un build expresamente autorizado |

Preferir una ruta de API bajo el mismo origen de la web para las cookies.
Vercel admite rewrites externos; la URL de destino se tomará del proyecto API
verificado, no de un valor inventado. Verificar `/api/v1`, alias temporales y `/media/exercises`,
Origin, `Set-Cookie`, logout y CORS con navegador real antes de adoptarlo.
[Rewrites de Vercel](https://vercel.com/docs/routing/rewrites).
No cambiar `SameSite=Lax`, `HttpOnly`, `Secure` de producción ni la ruta `/api`
para disimular una configuración de orígenes incorrecta.

## Puertas de aceptación pendientes

1. Todos los jobs relevantes de ambos CI y cliente OpenAPI sin diferencias;
   las auditorías y los presupuestos de rendimiento siguen siendo puertas reales.
2. Compilación específica de Vercel:
   generar Prisma antes del build de API y comprobar inclusión de los 2.648
   archivos multimedia, atribución y rutas. No excluir los GIF para hacer caber
   un bundle; medir el artefacto efectivo contra los límites vigentes.
3. Confirmar servicios gratuitos, cuotas, región y compatibilidad de PostgreSQL
   en Vercel antes de crear nada. Coste cero no significa recursos ilimitados.
4. Revisar conexiones por instancia: el adaptador actual admite cinco conexiones;
   comprobar el total al escalar, timeouts y cierre. Verificar además los límites
   de frecuencia entre instancias y detrás del proxy, no solo en un proceso local.
   La implementación local de `RateLimitStore` sustituye el `Map` por cuotas
   atómicas en PostgreSQL; dos aplicaciones locales ya comparten los cinco
   intentos de login. Las pruebas locales unitarias, integración y migración
   poblada pasan. La medición local completa del 13 de octubre aceptó los 30
   escenarios calientes con los presupuestos originales y un 95 % de confianza;
   no acredita latencia en Vercel ni estabilidad bajo cualquier carga.
   La preparación de la identidad del cliente usa únicamente
   `X-Vercel-Forwarded-For` cuando el entorno del servidor indica `VERCEL=1`.
   Acepta una sola IP válida, normaliza IPv6 y rechaza identidades ausentes o
   malformadas con 503; fuera de Vercel conserva la identidad del socket y no
   confía en encabezados reenviados. No se activa `trust proxy` global.
   Esto requiere verificación HTTPS en la plataforma antes de exposición:
   comprobar encabezados hostiles, aislamiento entre clientes y el efecto de
   rewrites web→API sobre la identidad. Las pruebas locales no demuestran el
   comportamiento del ingress de Vercel.
   [Encabezados de Vercel](https://vercel.com/docs/headers/request-headers).
5. Ensayar backup/restauración y migración compatible sobre una copia autorizada,
   verificar conteos y estadísticas. Nunca reset, seed indiscriminado ni importar
   automáticamente cuentas de prueba en los datos conservados.
6. QA HTTPS: login, refresh rotativo, reutilización, logout, sincronización
   offline, conflicto, medios bajo demanda, health live/ready y arranque en frío.

Hasta completar estas puertas no se declara staging listo ni desplegado. No se
añaden pings periódicos, cron de keep-alive, servicios de pago ni conexiones
automáticas a Vercel para evitar la suspensión de un servidor.
