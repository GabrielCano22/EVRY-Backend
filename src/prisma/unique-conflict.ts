import { Prisma } from '@prisma/client';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

/** Prisma's legacy engine and PostgreSQL driver adapter expose different metadata. */
export function uniqueConflictTargets(error: unknown): string[] | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
  const target = error.meta?.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) return target.filter((field): field is string => typeof field === 'string');

  const cause = record(record(error.meta?.driverAdapterError)?.cause);
  if (cause?.kind !== 'UniqueConstraintViolation') return null;
  const constraint = record(cause.constraint);
  if (typeof constraint?.index === 'string') return [constraint.index];
  return Array.isArray(constraint?.fields)
    ? constraint.fields.filter((field): field is string => typeof field === 'string') : null;
}
