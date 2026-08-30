import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoutineDto, UpdateRoutineDto } from './dto/routine.dto';
import { ServicioSesionActiva } from '../workouts/servicio-sesion-activa';
import { assertExercisesVisible } from '../exercises/exercise-visibility';

const routineInclude = {
  exercises: { include: { exercise: true }, orderBy: { order: 'asc' } },
} satisfies Prisma.RoutineInclude;

@Injectable()
export class RoutinesService {
  constructor(
    private prisma: PrismaService,
    private sesionActiva: ServicioSesionActiva,
  ) {}

  async list(userId: string) {
    return this.prisma.routine.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: 'asc' }, { createdAt: 'asc' }],
      include: { exercises: { include: { exercise: true }, orderBy: { order: 'asc' } } },
    });
  }

  async getById(userId: string, id: string) {
    const routine = await this.prisma.routine.findUnique({
      where: { id },
      include: { exercises: { include: { exercise: true }, orderBy: { order: 'asc' } } },
    });
    if (!routine) throw new NotFoundException();
    if (routine.userId !== userId) throw new ForbiddenException();
    return routine;
  }

  async create(userId: string, dto: CreateRoutineDto) {
    this.assertValidExercises(dto.exercises);
    return this.prisma.$transaction(async (tx) => {
      await assertExercisesVisible(tx, userId, dto.exercises.map((exercise) => exercise.exerciseId));
      return tx.routine.create({
        data: {
          userId,
          name: dto.name,
          dayOfWeek: dto.dayOfWeek ?? null,
          notes: dto.notes,
          exercises: { create: dto.exercises.map((exercise) => this.toRoutineExerciseData(exercise)) },
        },
        include: routineInclude,
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateRoutineDto) {
    if (dto.exercises) this.assertValidExercises(dto.exercises);

    return this.prisma.$transaction(async (tx) => {
      await this.assertOwn(userId, id, tx);
      if (dto.exercises) {
        await assertExercisesVisible(tx, userId, dto.exercises.map((exercise) => exercise.exerciseId));
        await tx.routineExercise.deleteMany({ where: { routineId: id } });
      }

      return tx.routine.update({
        where: { id },
        data: {
          name: dto.name,
          dayOfWeek: dto.dayOfWeek === undefined ? undefined : dto.dayOfWeek,
          notes: dto.notes,
          exercises: dto.exercises
            ? { create: dto.exercises.map((exercise) => this.toRoutineExerciseData(exercise)) }
            : undefined,
        },
        include: routineInclude,
      });
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwn(userId, id);
    await this.prisma.routine.delete({ where: { id } });
    return { ok: true };
  }

  // Crea Workout enlazado a la rutina, sin sets aún (el usuario los registra al ir).
  async start(userId: string, id: string) {
    const routine = await this.getById(userId, id);
    return this.sesionActiva.iniciarOContinuar(userId, {
      name: routine.name,
      routineId: routine.id,
    });
  }

  private async assertOwn(
    userId: string,
    id: string,
    db: Pick<Prisma.TransactionClient, 'routine'> = this.prisma,
  ) {
    const routine = await db.routine.findUnique({ where: { id } });
    if (!routine) throw new NotFoundException();
    if (routine.userId !== userId) throw new ForbiddenException();
  }

  private assertValidExercises(exercises: CreateRoutineDto['exercises']) {
    const ids = exercises.map((exercise) => exercise.exerciseId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('No puedes repetir un ejercicio en la misma rutina.');
    }

    for (const exercise of exercises) {
      if (exercise.seriesPlan && exercise.seriesPlan.length !== exercise.targetSets) {
        throw new BadRequestException('El plan de series debe coincidir con las series objetivo.');
      }
      if (exercise.targetWeightKg !== undefined && exercise.targetWeightKg < 0) {
        throw new BadRequestException('El peso objetivo no puede ser negativo.');
      }
      if (exercise.seriesPlan?.some((series) => series.weightKg !== undefined && series.weightKg !== null && series.weightKg < 0)) {
        throw new BadRequestException('El peso de una serie no puede ser negativo.');
      }
    }
  }

  private toRoutineExerciseData(exercise: CreateRoutineDto['exercises'][number]) {
    return {
      exerciseId: exercise.exerciseId,
      order: exercise.order,
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      targetWeightKg: exercise.targetWeightKg,
      seriesPlan: exercise.seriesPlan
        ? (exercise.seriesPlan as unknown as Prisma.InputJsonValue)
        : undefined,
      notes: exercise.notes,
    };
  }
}
