import { createPrismaClient, prismaClientOptions } from './prisma-client';

describe('Prisma 7 PostgreSQL adapter', () => {
  it('requires an explicit database URL for scripts as well as runtime', () => {
    expect(() => prismaClientOptions(' ')).toThrow('DATABASE_URL');
  });

  it('constructs a client without opening a connection until requested', async () => {
    const client = createPrismaClient('postgresql://evry:evry@127.0.0.1:1/evry_test');
    expect(typeof client.$connect).toBe('function');
    await expect(client.$disconnect()).resolves.toBeUndefined();
  });
});
