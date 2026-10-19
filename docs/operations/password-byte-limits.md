# Contraseñas nuevas y compatibilidad histórica

Los registros web y móviles rechazan contraseñas que superan 72 bytes UTF-8,
además del mínimo existente de ocho caracteres. No se recortan ni normalizan.
También se rechaza UTF-16 malformado, sin provocar una excepción del validador.
OpenAPI publica `maxLength: 72` y explica el límite adicional en bytes: una
contraseña Unicode puede ocupar varios bytes por carácter.

Esta restricción corresponde a la capacidad del bcrypt instalado, que ignora
bytes posteriores al número 72. [Documentación de bcrypt](https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns).

No se cambian hashes, credenciales, sesiones ni reglas de login de las cuentas
existentes. El login conserva el máximo histórico de 128 caracteres para evitar
bloquear a personas que registraron contraseñas largas anteriormente.

La comparación de login sigue usando bcrypt: incluso para una contraseña nueva
de exactamente 72 bytes, añadir un sufijo puede producir la misma comparación.
La restricción de registro impide descartar parte del secreto elegido, pero no
declara una comparación íntegra de entradas de login mayores de 72 bytes.

Esto evita nuevos registros truncados, pero **no repara contraseñas históricas**:
un hash bcrypt no permite recuperar los bytes que ya se descartaron. Antes de
importar cuentas históricas a un entorno expuesto, habrá que definir y verificar
una estrategia compatible de actualización de credenciales; no se realizará una
reescritura automática ni un reinicio de contraseñas como parte de este cambio.

Los clientes deberán explicar el límite en su formulario de registro y mostrar
los errores por campo. La regeneración de OpenAPI y del cliente compartido sigue
siendo obligatoria; este documento no acredita la validación de ambos formularios
ni la aceptación de un despliegue.

La integración HTTP/PostgreSQL verifica ambas rutas de registro: ASCII de 73
bytes, Unicode de 74 bytes y UTF-16 malformado reciben `400`, con
`fieldErrors.password`, sin cuenta, cookie ni tokens de acceso creados. ASCII,
Unicode de dos bytes y emoji de cuatro bytes se aceptan en la frontera de 72
bytes; el hash verifica la contraseña completa y rechaza una versión acortada.
También se verifica la separación de sesiones web por cookie y móviles por JSON.
Estas comprobaciones no prueban el comportamiento de los formularios ni eliminan
la limitación histórica de comparación de login descrita arriba.
