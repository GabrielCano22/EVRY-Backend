import { normalizeDatabaseUrl } from './database-url';

describe('normalizeDatabaseUrl', () => {
  it('adapta Neon pooler para Prisma y elimina channel binding incompatible', () => {
    const result = normalizeDatabaseUrl(
      'postgresql://usuario:clave@ep-demo-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    );

    expect(result).toBe(
      'postgresql://usuario:clave@ep-demo-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true',
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
