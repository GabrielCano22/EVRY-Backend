# Registro móvil

El registro nativo usa `POST /api/v1/auth/mobile/register` con el mismo DTO y las
mismas validaciones que el registro web. Devuelve access token, refresh token y
caducidad en el cuerpo, sin cookie ni requisito de Origin del navegador. La
familia emitida pertenece a `MOBILE`; el registro web conserva `WEB` por defecto.
El límite específico es de tres solicitudes por minuto.

El cliente móvil debe almacenar el refresh token en SecureStore mediante el
flujo de sesión existente y consultar `/users/me` antes de abrir datos de cuenta.
El seguimiento del ciclo permanece voluntario e independiente del sexo.

## Evidencia local del 8 de septiembre de 2026

- La regresión del servicio falló primero porque emitía `WEB` al registrar una
  cuenta móvil. Tras la implementación, las dos suites focales aprobaron nueve
  pruebas, incluida la respuesta HTTP sin cookies y el rechazo `429` del cuarto
  intento. La prueba HTTP sustituye persistencia y servicio de autenticación;
  no demuestra persistencia real.
- La comprobación de tipos, lint, build y generación OpenAPI terminaron correctamente.
- La integración HTTP/PostgreSQL de registro, perfil autenticado, plataforma
  persistida, rotación, logout y correo duplicado pasó dentro del foco conjunto
  de autenticación y ciclo: 2 suites / 24 pruebas.
- La suite completa pasó 8 suites / 78 pruebas sobre un clúster PostgreSQL 17.11
  sintético creado desde cero y las ocho migraciones existentes. No se
  modificaron datos reales.
