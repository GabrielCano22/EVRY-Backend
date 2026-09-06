import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const WORKOUT_LOCK_PREFIX = 'evry:workout-lifecycle:';

export async function lockWorkoutLifecycle(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${WORKOUT_LOCK_PREFIX}${userId}`}, 0))`,
  );
}

export function runWorkoutTransaction<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}
