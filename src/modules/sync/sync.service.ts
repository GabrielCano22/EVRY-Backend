import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkoutStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertExercisesVisible } from '../exercises/exercise-visibility';
import { ExerciseStatsService } from '../workouts/exercise-stats.service';
import {
  lockWorkoutLifecycle,
  runSerializableTransaction,
} from '../workouts/serializable-transaction';
import { SyncWorkoutDto } from './dto/sync-workout.dto';
import { RevisionConflictException } from './revision-conflict.exception';

const syncWorkoutInclude = Prisma.validator<Prisma.WorkoutInclude>()({
  sets: {
    include: { exercise: true },
    orderBy: [{ order: 'asc' }, { completedAt: 'asc' }, { id: 'asc' }],
  },
  routine: true,
});

type CanonicalWorkout = Prisma.WorkoutGetPayload<{ include: typeof syncWorkoutInclude }>;

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exerciseStats: ExerciseStatsService,
  ) {}

  syncWorkout(userId: string, dto: SyncWorkoutDto) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await lockWorkoutLifecycle(tx, userId);

      const replay = await tx.workout.findFirst({
        where: { userId, lastSyncId: dto.syncId },
        include: syncWorkoutInclude,
      });
      if (replay) return this.response(replay);

      const existing = await tx.workout.findUnique({
        where: { userId_clientId: { userId, clientId: dto.clientId } },
        include: syncWorkoutInclude,
      });
      if (existing && existing.revision !== dto.baseRevision) {
        throw new RevisionConflictException(existing);
      }
      if (!existing && dto.baseRevision !== 0) {
        throw new RevisionConflictException(null);
      }
      if (existing && existing.status !== 'ACTIVE') {
        throw new BadRequestException('La sesión sincronizada ya no admite cambios.');
      }

      if (dto.status === 'ACTIVE') {
        const active = await tx.workout.findFirst({
          where: { userId, status: 'ACTIVE' },
          include: syncWorkoutInclude,
        });
        if (active && active.id !== existing?.id) {
          throw new RevisionConflictException(
            active,
            'ACTIVE_WORKOUT_CONFLICT',
            'Ya existe otra sesión activa. Elige cuál deseas conservar.',
          );
        }
      }

      if (dto.routineId) {
        const routine = await tx.routine.findFirst({
          where: { id: dto.routineId, userId },
          select: { id: true },
        });
        if (!routine) throw new NotFoundException();
      }
      await assertExercisesVisible(tx, userId, dto.sets.map(({ exerciseId }) => exerciseId));

      const workoutId = existing?.id ?? (await tx.workout.create({
        data: {
          userId,
          clientId: dto.clientId,
          lastSyncId: dto.syncId,
          revision: 1,
          name: dto.name,
          notes: dto.notes,
          routineId: dto.routineId,
          startedAt: new Date(dto.startedAt),
          ...this.lifecycle(dto.status, dto.endedAt, dto.cancelledAt),
        },
        select: { id: true },
      })).id;

      const existingSets = existing?.sets ?? [];
      const byClientId = new Map(
        existingSets
          .filter((set): set is typeof set & { clientId: string } => Boolean(set.clientId))
          .map((set) => [set.clientId, set]),
      );
      const incomingExistingIds = dto.sets
        .map(({ clientId }) => byClientId.get(clientId)?.id)
        .filter((id): id is string => Boolean(id));
      if (incomingExistingIds.length > 0) {
        await tx.workoutSet.updateMany({
          where: { workoutId, id: { in: incomingExistingIds } },
          data: { order: { increment: 1_000_000 } },
        });
      }

      for (const set of dto.sets) {
        const canonicalSet = byClientId.get(set.clientId);
        if (canonicalSet && canonicalSet.revision !== set.baseRevision) {
          throw new RevisionConflictException(existing);
        }
        const data = {
          exerciseId: set.exerciseId,
          order: set.order,
          weightKg: set.weightKg,
          reps: set.reps,
          durationS: set.durationS,
          rpe: set.rpe,
          isWarmup: set.isWarmup,
          techniqueStable: set.techniqueStable,
          completedAt: set.completedAt ? new Date(set.completedAt) : undefined,
        };
        if (canonicalSet) {
          await tx.workoutSet.update({
            where: { id: canonicalSet.id },
            data: { ...data, revision: { increment: 1 } },
          });
        } else {
          await tx.workoutSet.create({
            data: {
              workoutId,
              clientId: set.clientId,
              clientMutationId: set.clientId,
              revision: 1,
              ...data,
            },
          });
        }
      }

      if (dto.deletedSetClientIds.length > 0) {
        await tx.workoutSet.deleteMany({
          where: { workoutId, clientId: { in: dto.deletedSetClientIds } },
        });
      }

      const usefulSets = await tx.workoutSet.findMany({
        where: {
          workoutId,
          OR: [{ reps: { gt: 0 } }, { durationS: { gt: 0 } }],
        },
        select: { exerciseId: true },
      });
      if (dto.status === 'COMPLETED' && usefulSets.length === 0) {
        throw new BadRequestException('Registra al menos una serie útil antes de finalizar.');
      }

      if (existing) {
        await tx.workout.update({
          where: { id: workoutId },
          data: {
            lastSyncId: dto.syncId,
            name: dto.name,
            notes: dto.notes,
            routineId: dto.routineId,
            startedAt: new Date(dto.startedAt),
            revision: { increment: 1 },
            ...this.lifecycle(dto.status, dto.endedAt, dto.cancelledAt),
          },
        });
      }

      const affectedExerciseIds = [
        ...existingSets.map(({ exerciseId }) => exerciseId),
        ...dto.sets.map(({ exerciseId }) => exerciseId),
      ];
      if (dto.status !== 'ACTIVE') {
        await this.exerciseStats.rebuildExerciseStats(tx, userId, affectedExerciseIds);
      }

      const canonical = await tx.workout.findUnique({
        where: { id: workoutId },
        include: syncWorkoutInclude,
      });
      if (!canonical) throw new NotFoundException();
      return this.response(canonical);
    });
  }

  private lifecycle(status: WorkoutStatus, endedAt?: string, cancelledAt?: string) {
    if (status === 'COMPLETED') {
      return { status, endedAt: endedAt ? new Date(endedAt) : new Date(), cancelledAt: null };
    }
    if (status === 'CANCELLED') {
      return { status, endedAt: null, cancelledAt: cancelledAt ? new Date(cancelledAt) : new Date() };
    }
    return { status, endedAt: null, cancelledAt: null };
  }

  private response(workout: CanonicalWorkout) {
    return {
      workout,
      revision: workout.revision,
      mapping: {
        workout: { clientId: workout.clientId, serverId: workout.id },
        sets: workout.sets
          .filter((set): set is typeof set & { clientId: string } => Boolean(set.clientId))
          .map((set) => ({ clientId: set.clientId, serverId: set.id, revision: set.revision })),
      },
    };
  }
}
