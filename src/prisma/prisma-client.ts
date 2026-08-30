import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { normalizeDatabaseUrl } from './database-url';

export function prismaClientOptions(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl?.trim()) throw new Error('DATABASE_URL is required.');
  return {
    adapter: new PrismaPg({
      connectionString: normalizeDatabaseUrl(databaseUrl),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 5,
    }),
  };
}

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  return new PrismaClient(prismaClientOptions(databaseUrl));
}
