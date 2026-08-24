import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { runSerializableTransaction } from './serializable-transaction';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(code, {
    clientVersion: '5.10.0',
    code,
  });
}

describe('runSerializableTransaction', () => {
  it('retries P2034 at most until the third bounded attempt succeeds', async () => {
    const tx = { marker: 'transaction-client' };
    const transaction = jest.fn()
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockRejectedValueOnce(prismaError('P2034'))
      .mockImplementationOnce((operation: (client: unknown) => unknown) => operation(tx));
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const operation = jest.fn().mockResolvedValue('committed');

    await expect(runSerializableTransaction(prisma, operation)).resolves.toBe('committed');

    expect(transaction).toHaveBeenCalledTimes(3);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledWith(tx);
    for (const call of transaction.mock.calls) {
      expect(call[1]).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
  });

  it('throws the third P2034 instead of retrying forever', async () => {
    const error = prismaError('P2034');
    const transaction = jest.fn().mockRejectedValue(error);
    const prisma = { $transaction: transaction } as unknown as PrismaService;

    await expect(runSerializableTransaction(prisma, jest.fn())).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry validation, permissions, stats, or any non-P2034 error', async () => {
    const error = new Error('stats failed');
    const transaction = jest.fn().mockRejectedValue(error);
    const prisma = { $transaction: transaction } as unknown as PrismaService;

    await expect(runSerializableTransaction(prisma, jest.fn())).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
