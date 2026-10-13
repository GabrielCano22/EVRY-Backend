# Reparación compatible de récords Epley

La migración `20261012030000_epley_binary64_records` reconcilia únicamente
`estimated1RM`, su fecha, carga y repeticiones en las filas existentes de
`ExerciseStat`. No crea ni borra estadísticas, sesiones o series y no modifica
ninguna migración ya aplicada. Los demás campos permanecen intactos.

El cálculo usa división `double precision` antes de multiplicar, igual que el
dominio JavaScript. Se elige el mayor valor sin redondear; los empates reales
se resuelven por fecha y luego ID descendente. Así, 75 × 10 vence a 60 × 20:
ambos se muestran como 100, pero el segundo valor binario es ligeramente menor.
Se excluyen calentamientos, sesiones sin finalizar, canceladas y series sin
carga o repeticiones positivas. Sin una serie elegible, el récord derivado
queda en cero y sus detalles en `NULL`.

## Secuencia de operación

1. Mantener pausadas las mutaciones de entrenamiento y los escritores de
   estadísticas. No mezclar versiones durante la reparación.
2. Crear un archivo `pg_dump` verificable y registrar inventarios de fuente.
3. Aplicar la migración compatible: su transacción bloquea escrituras sobre
   sesiones, series y estadísticas mientras mantiene disponibles las lecturas.
4. Comparar todos los campos de fuente y los campos no Epley de estadísticas;
   comprobar los récords derivados antes de reanudar los escritores actualizados.
5. Si falla, conservar la evidencia y resolver la causa; no reiniciar ni borrar
   la base. Para recuperación, restaurar el archivo en una base NUEVA, validar
   sus inventarios y solo entonces evaluar el cambio de conexión.

El SQL es idempotente: solo actualiza los cuatro campos cuando difieren.
La prueba poblada comprueba empate aproximado y real, aislamiento por usuario,
exclusiones, preservación completa, repetición del SQL sin actualizaciones y
restauración del respaldo previo seguida de migración.

Esta fase ensaya exclusivamente bases locales sintéticas. No autoriza una
migración de datos reales, un cambio de conexión ni un despliegue remoto.
