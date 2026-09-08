# Traslado de registros del ciclo

Al recibir `previousDate` distinta de `date`, la API actualiza la entrada original
por su clave compuesta de usuario y fecha. Conserva su ID y los campos omitidos.
La restricción única de usuario/fecha evita sobrescribir otro registro: el error
Prisma `P2002` se convierte en HTTP 409. Si la entrada original desapareció,
`P2025` se convierte en HTTP 404 y no se crea una entrada sustituta.

La operación anterior borraba el origen y hacía upsert en el destino dentro de
una transacción; la transacción no impedía sobrescribir un destino existente.
El nuevo traslado es un único UPDATE, sin borrado ni upsert.

## Verificación local

El 7 de septiembre de 2026 se reprodujo el conflicto omitido con una prueba que
resolvía exitosamente en lugar de rechazar el traslado. Tras corregirlo pasaron
siete pruebas focales y la comprobación de tipos, incluida la nueva integración.

La integración añadida en `test/cycle-calendar.integration-spec.ts` comprueba
colisión sin cambios en ambas filas, traslado conservando ID/campos y rechazo de
origen ausente. No se ha ejecutado todavía contra PostgreSQL porque el entorno
rechazó arrancar el clúster local de pruebas. Tampoco se ha medido una carrera
con múltiples conexiones. Estos casos no se presentan como verificados.

Crear/actualizar un día sin traslado conserva el upsert existente. La prevención
de sobrescritura aquí documentada corresponde al traslado entre fechas.
