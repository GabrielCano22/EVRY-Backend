import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const WORKOUT_LOCK_PREFIX = 'evry:workout-lifecycle:';

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function lockWorkoutLifecycle(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${WORKOUT_LOCK_PREFIX}${userId}`}, 0))`,
  );
}

export async function runSerializableTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isPrismaErrorCode(error, 'P2034') || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new Error('Serializable transaction retry bound is unreachable.');
}
