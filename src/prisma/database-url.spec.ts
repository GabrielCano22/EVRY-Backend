import { normalizeDatabaseUrl } from './database-url';

describe('normalizeDatabaseUrl', () => {
  it('preserva los parámetros TLS de Neon para el adaptador PostgreSQL', () => {
    const result = normalizeDatabaseUrl(
      'postgresql://usuario:clave@ep-demo-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    );

    expect(result).toBe(
      'postgresql://usuario:clave@ep-demo-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    );
  });

  it('no modifica una base de datos local ni URLs ya compatibles', () => {
    const local = 'postgresql://postgres:postgres@localhost:5432/evry?schema=public';
    expect(normalizeDatabaseUrl(local)).toBe(local);

    const compatible =
      'postgresql://usuario:clave@ep-demo-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true';
    expect(normalizeDatabaseUrl(compatible)).toBe(compatible);
  });
});
