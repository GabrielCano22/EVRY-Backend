import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('propaga el fallo de conexion para impedir que la aplicacion anuncie salud', async () => {
    const service = new PrismaService();
    const unavailable = new Error('database unavailable');
    jest.spyOn(service, '$connect').mockRejectedValue(unavailable);

    await expect(service.onModuleInit()).rejects.toBe(unavailable);
  });
});
