import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoutineDto, UpdateRoutineDto } from './dto/routine.dto';
import { ServicioSesionActiva } from '../workouts/servicio-sesion-activa';

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
    this.assertUniqueExercises(dto.exercises);
    return this.prisma.routine.create({
      data: {
        userId,
        name: dto.name,
        dayOfWeek: dto.dayOfWeek ?? null,
        notes: dto.notes,
        exercises: {
          create: dto.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            order: e.order,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            targetWeightKg: e.targetWeightKg,
            notes: e.notes,
          })),
        },
      },
      include: { exercises: { include: { exercise: true } } },
    });
  }

  async update(userId: string, id: string, dto: UpdateRoutineDto) {
    await this.assertOwn(userId, id);
    if (dto.exercises) {
      this.assertUniqueExercises(dto.exercises);
      await this.prisma.routineExercise.deleteMany({ where: { routineId: id } });
    }
    return this.prisma.routine.update({
      where: { id },
      data: {
        name: dto.name,
        dayOfWeek: dto.dayOfWeek === undefined ? undefined : dto.dayOfWeek,
        notes: dto.notes,
        exercises: dto.exercises
          ? {
              create: dto.exercises.map((e) => ({
                exerciseId: e.exerciseId,
                order: e.order,
                targetSets: e.targetSets,
                targetReps: e.targetReps,
                targetWeightKg: e.targetWeightKg,
                notes: e.notes,
              })),
            }
          : undefined,
      },
      include: { exercises: { include: { exercise: true } } },
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

  private async assertOwn(userId: string, id: string) {
    const routine = await this.prisma.routine.findUnique({ where: { id } });
    if (!routine) throw new NotFoundException();
    if (routine.userId !== userId) throw new ForbiddenException();
  }

  private assertUniqueExercises(exercises: CreateRoutineDto['exercises']) {
    const ids = exercises.map((exercise) => exercise.exerciseId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('No puedes repetir un ejercicio en la misma rutina.');
    }
  }
}
