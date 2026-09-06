import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { runWorkoutTransaction } from './workout-transaction';

describe('runWorkoutTransaction', () => {
  it('uses read committed because the user-scoped advisory lock provides lifecycle isolation', async () => {
    const tx = { marker: 'transaction-client' };
    const transaction = jest.fn()
      .mockImplementationOnce((operation: (client: unknown) => unknown) => operation(tx));
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const operation = jest.fn().mockResolvedValue('committed');

    await expect(runWorkoutTransaction(prisma, operation)).resolves.toBe('committed');

    expect(transaction).toHaveBeenCalledWith(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
    expect(operation).toHaveBeenCalledWith(tx);
  });

  it('propagates failures without replaying application code', async () => {
    const error = new Error('stats failed');
    const transaction = jest.fn().mockRejectedValue(error);
    const prisma = { $transaction: transaction } as unknown as PrismaService;

    await expect(runWorkoutTransaction(prisma, jest.fn())).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
