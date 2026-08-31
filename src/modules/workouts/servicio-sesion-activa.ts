import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { uniqueConflictTargets } from '../../prisma/unique-conflict';
import { CycleService } from '../cycle/cycle.service';

export interface StartWorkoutInput {
  name: string;
  notes?: string;
  routineId?: string;
}

export const workoutDetailInclude = Prisma.validator<Prisma.WorkoutInclude>()({
  sets: {
    include: { exercise: true },
    orderBy: [{ order: 'asc' }, { completedAt: 'asc' }, { id: 'asc' }],
  },
  routine: {
    include: {
      exercises: {
        include: { exercise: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      },
    },
  },
});

function isActiveWorkoutConflict(error: unknown): boolean {
  const fields = uniqueConflictTargets(error);
  if (!fields) return false;
  return fields.includes('userId')
    || fields.includes('Workout_userId_active_unique')
    || fields.includes('Workout_userId_status_active_unique');
}

@Injectable()
export class ServicioSesionActiva {
  constructor(
    private prisma: PrismaService,
    private ciclo: CycleService,
  ) {}

  async startOrResume(userId: string, input: StartWorkoutInput) {
    const active = await this.findActive(userId);
    if (active) return active;

    if (input.routineId) {
      const routine = await this.prisma.routine.findFirst({
        where: { id: input.routineId, userId },
        select: { id: true },
      });
      if (!routine) throw new NotFoundException();
    }

    const phase = await this.ciclo.currentPhase(userId).catch(() => null);
    try {
      return await this.prisma.workout.create({
        data: { userId, ...input, cyclePhase: phase ?? undefined },
        include: workoutDetailInclude,
      });
    } catch (error) {
      if (!isActiveWorkoutConflict(error)) throw error;
      const winner = await this.findActive(userId);
      if (!winner) throw error;
      return winner;
    }
  }

  iniciarOContinuar(userId: string, input: StartWorkoutInput) {
    return this.startOrResume(userId, input);
  }

  private findActive(userId: string) {
    return this.prisma.workout.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      include: workoutDetailInclude,
    });
  }
}
