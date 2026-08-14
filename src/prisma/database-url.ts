/**
 * Ajusta las URLs del pooler de Neon para el motor de Prisma.
 *
 * Prisma usa conexiones preparadas y el pooler necesita el modo pgbouncer.
 * `channel_binding=require` provoca P1001 con esta combinación de cliente y
 * endpoint, aunque el servidor acepte conexiones TLS.
 */
export function normalizeDatabaseUrl(databaseUrl: string): string {
  if (!databaseUrl.trim()) return databaseUrl;

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isNeonPooler = hostname.includes('-pooler') && hostname.endsWith('.neon.tech');
  if (!isNeonPooler) return databaseUrl;

  if (parsed.searchParams.get('channel_binding')?.toLowerCase() === 'require') {
    parsed.searchParams.delete('channel_binding');
  }
  if (!parsed.searchParams.has('pgbouncer')) {
    parsed.searchParams.set('pgbouncer', 'true');
  }

  return parsed.toString();
}
