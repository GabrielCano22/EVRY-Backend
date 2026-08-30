/**
 * Prisma 7 delega la conexión al driver pg. No rebajamos ni eliminamos
 * parámetros TLS de la URL; sólo quitamos espacios de configuración.
 */
export function normalizeDatabaseUrl(databaseUrl: string): string {
  return databaseUrl.trim();
}
