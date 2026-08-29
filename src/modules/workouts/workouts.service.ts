import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { findVisibleExerciseOrThrow } from '../exercises/exercise-visibility';
import {
  CreateSetDto,
  CreateWorkoutDto,
  FinishWorkoutDto,
  UpdateSetDto,
  UpdateWorkoutDto,
} from './dto/workout.dto';
import { ExerciseStatsService } from './exercise-stats.service';
import {
  ServicioSesionActiva,
  workoutDetailInclude,
} from './servicio-sesion-activa';
import {
  lockWorkoutLifecycle,
  runSerializableTransaction,
} from './serializable-transaction';

function uniqueConflictTargets(error: unknown): string[] | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }
  const target = error.meta?.target;
  return Array.isArray(target) ? target.map(String) : [String(target ?? '')];
}

function isSetMutationConflict(error: unknown): boolean {
  const targets = uniqueConflictTargets(error);
  if (!targets) return false;
  return targets.includes('WorkoutSet_workoutId_clientMutationId_key')
    || (targets.includes('workoutId') && targets.includes('clientMutationId'));
}

@Injectable()
export class WorkoutsService {
  constructor(
    private prisma: PrismaService,
    private sesionActiva: ServicioSesionActiva,
    private exerciseStats: ExerciseStatsService,
  ) {}

  create(userId: string, dto: CreateWorkoutDto) {
    return this.sesionActiva.iniciarOContinuar(userId, dto);
  }

  list(userId: string, take = 20, skip = 0) {
    return this.prisma.workout.findMany({
      where: { userId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      include: workoutDetailInclude,
      take,
      skip,
    });
  }

  async get(userId: string, id: string) {
    const workout = await this.prisma.workout.findUnique({
      where: { id },
      include: workoutDetailInclude,
    });
    return this.requireOwnedWorkout(userId, workout);
  }

  update(userId: string, id: string, dto: UpdateWorkoutDto) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await lockWorkoutLifecycle(tx, userId);
      const workout = this.requireOwnedWorkout(
        userId,
        await tx.workout.findUnique({ where: { id } }),
      );
      this.assertMutable(workout);
      return tx.workout.update({
        where: { id },
        data: { ...dto, revision: { increment: 1 } },
        include: workoutDetailInclude,
      });
    });
  }

  finish(userId: string, id: string, dto: FinishWorkoutDto) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await lockWorkoutLifecycle(tx, userId);
      const workout = this.requireOwnedWorkout(
        userId,
        await tx.workout.findUnique({
          where: { id },
          include: workoutDetailInclude,
        }),
      );
      if (workout.cancelledAt) {
        throw new BadRequestException('No puedes finalizar una sesión cancelada.');
      }
      if (workout.endedAt) return workout;

      const hasUsefulSet = workout.sets.some(
        ({ reps, durationS }) => (reps ?? 0) > 0 || (durationS ?? 0) > 0,
      );
      if (!hasUsefulSet) {
        throw new BadRequestException('Registra al menos una serie útil antes de finalizar.');
      }

      const finished = await tx.workout.update({
        where: { id },
        data: {
          endedAt: new Date(),
          status: 'COMPLETED',
          revision: { increment: 1 },
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: workoutDetailInclude,
      });
      const exerciseIds = [...new Set(workout.sets.map(({ exerciseId }) => exerciseId))].sort();
      await this.exerciseStats.rebuildExerciseStats(tx, userId, exerciseIds);
      return finished;
    });
  }

  cancel(userId: string, id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await lockWorkoutLifecycle(tx, userId);
      const workout = this.requireOwnedWorkout(
        userId,
        await tx.workout.findUnique({
          where: { id },
          include: workoutDetailInclude,
        }),
      );
      if (workout.endedAt) {
        throw new BadRequestException('No puedes cancelar una sesión finalizada.');
      }
      if (workout.cancelledAt) return workout;

      return tx.workout.update({
        where: { id },
        data: { cancelledAt: new Date(), status: 'CANCELLED', revision: { increment: 1 } },
        include: workoutDetailInclude,
      });
    });
  }

  remove(userId: string, id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await lockWorkoutLifecycle(tx, userId);
      const workout = this.requireOwnedWorkout(
        userId,
        await tx.workout.findUnique({
          where: { id },
          include: { sets: { select: { exerciseId: true } } },
        }),
      );
      if (!workout.endedAt && !workout.cancelledAt) {
        throw new BadRequestException('Cancela una sesión activa en lugar de eliminarla.');
      }

      const exerciseIds = [...new Set(workout.sets.map(({ exerciseId }) => exerciseId))].sort();
      await tx.workout.delete({ where: { id } });
      await this.exerciseStats.rebuildExerciseStats(tx, userId, exerciseIds);
      return { ok: true };
    });
  }

  async addSet(userId: string, workoutId: string, dto: CreateSetDto) {
    try {
      return await runSerializableTransaction(this.prisma, async (tx) => {
        await lockWorkoutLifecycle(tx, userId);
        const workout = this.requireOwnedWorkout(
          userId,
          await tx.workout.findUnique({ where: { id: workoutId } }),
        );
        this.assertMutable(workout);
        await findVisibleExerciseOrThrow(tx, userId, dto.exerciseId);

        const uniqueKey = {
          workoutId_clientMutationId: {
            workoutId,
            clientMutationId: dto.clientMutationId,
          },
        };
        const existing = await tx.workoutSet.findUnique({
          where: uniqueKey,
          include: { exercise: true },
        });
        if (existing) return existing;

        return tx.workoutSet.create({
          data: { workoutId, ...dto },
          include: { exercise: true },
        });
      });
    } catch (error) {
      if (!isSetMutationConflict(error)) throw error;
      const canonical = await this.prisma.workoutSet.findUnique({
        where: {
          workoutId_clientMutationId: {
            workoutId,
            clientMutationId: dto.clientMutationId,
          },
        },
        include: { exercise: true },
      });
      if (!canonical) throw error;
      return canonical;
    }
  }

  updateSet(userId: string, setId: string, dto: UpdateSetDto) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await lockWorkoutLifecycle(tx, userId);
      const set = await tx.workoutSet.findUnique({
        where: { id: setId },
        include: { workout: true },
      });
      if (!set) throw new NotFoundException();
      const workout = this.requireOwnedWorkout(userId, set.workout);
      this.assertMutable(workout);
      return tx.workoutSet.update({
        where: { id: setId },
        data: { ...dto, revision: { increment: 1 } },
        include: { exercise: true },
      });
    });
  }

  removeSet(userId: string, setId: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await lockWorkoutLifecycle(tx, userId);
      const set = await tx.workoutSet.findUnique({
        where: { id: setId },
        include: { workout: true },
      });
      if (!set) throw new NotFoundException();
      const workout = this.requireOwnedWorkout(userId, set.workout);
      this.assertMutable(workout);
      await tx.workoutSet.delete({ where: { id: setId } });
      return { ok: true };
    });
  }

  private requireOwnedWorkout<T extends { userId: string }>(
    userId: string,
    workout: T | null,
  ): T {
    if (!workout) throw new NotFoundException();
    if (workout.userId !== userId) throw new ForbiddenException();
    return workout;
  }

  private assertMutable(workout: { endedAt: Date | null; cancelledAt: Date | null }): void {
    if (workout.endedAt || workout.cancelledAt) {
      throw new BadRequestException('La sesión ya no admite cambios.');
    }
  }
}
