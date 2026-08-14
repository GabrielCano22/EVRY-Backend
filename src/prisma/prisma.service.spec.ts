import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('does not block application startup while the database connection is pending', async () => {
    const service = new PrismaService();
    jest.spyOn(service, '$connect').mockImplementation(
      () => new Promise<void>(() => undefined),
    );

    const initialized = await Promise.race([
      service.onModuleInit().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 25)),
    ]);

    expect(initialized).toBe(true);
  });
});
