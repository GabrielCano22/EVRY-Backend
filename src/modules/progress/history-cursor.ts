import { BadRequestException } from '@nestjs/common';
import type { ProgressPeriod } from './progress.types';

interface HistoryScope { exerciseId: string; period: ProgressPeriod }
export interface HistoryPosition { endedAt: Date; workoutId: string }

export function encodeHistoryCursor(input: HistoryScope & HistoryPosition): string {
  return Buffer.from(JSON.stringify({
    v: 1, exerciseId: input.exerciseId, period: input.period,
    endedAt: input.endedAt.toISOString(), workoutId: input.workoutId,
  })).toString('base64url');
}

export function decodeHistoryCursor(token: string, scope: HistoryScope): HistoryPosition {
  try {
    if (!token || token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const decoded: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error();
    const value = decoded as Record<string, unknown>;
    if (value.v !== 1 || value.exerciseId !== scope.exerciseId || value.period !== scope.period
      || typeof value.workoutId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.workoutId)
      || typeof value.endedAt !== 'string') throw new Error();
    const endedAt = new Date(value.endedAt);
    if (!Number.isFinite(endedAt.getTime()) || endedAt.toISOString() !== value.endedAt) throw new Error();
    return { endedAt, workoutId: value.workoutId };
  } catch {
    throw new BadRequestException('El cursor de historial no es válido para este ejercicio y periodo.');
  }
}
