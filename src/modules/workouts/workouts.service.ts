import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSetDto, CreateWorkoutDto, FinishWorkoutDto, UpdateSetDto, UpdateWorkoutDto } from './dto/workout.dto';
import { ServicioSesionActiva } from './servicio-sesion-activa';

@Injectable()
export class WorkoutsService {
  constructor(
    private prisma: PrismaService,
    private sesionActiva: ServicioSesionActiva,
  ) {}

  async create(userId: string, dto: CreateWorkoutDto) {
    return this.sesionActiva.iniciarOContinuar(userId, dto);
  }

  list(userId: string, take = 20, skip = 0) {
    return this.prisma.workout.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      include: { sets: { include: { exercise: true } } },
      take,
      skip,
    });
  }

  async get(userId: string, id: string) {
    const w = await this.prisma.workout.findUnique({
      where: { id },
      include: {
        sets: { include: { exercise: true }, orderBy: { order: 'asc' } },
        routine: {
          include: {
            exercises: { include: { exercise: true }, orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!w) throw new NotFoundException();
    if (w.userId !== userId) throw new ForbiddenException();
    return w;
  }

  async update(userId: string, id: string, dto: UpdateWorkoutDto) {
    await this.assertOwn(userId, id);
    return this.prisma.workout.update({ where: { id }, data: dto });
  }

  async finish(userId: string, id: string, dto: FinishWorkoutDto) {
    const workout = await this.assertOwn(userId, id);
    if (workout.endedAt) return workout;

    const finished = await this.prisma.workout.update({
      where: { id },
      data: { endedAt: new Date(), notes: dto.notes },
      include: { sets: true },
    });
    await this.updateExerciseStats(userId, id);
    return finished;
  }

  async remove(userId: string, id: string) {
    await this.assertOwn(userId, id);
    await this.prisma.workout.delete({ where: { id } });
    return { ok: true };
  }

  async addSet(userId: string, workoutId: string, dto: CreateSetDto) {
    const workout = await this.assertOwn(userId, workoutId);
    if (workout.endedAt) {
      throw new BadRequestException('No puedes registrar series en una sesión finalizada.');
    }

    return this.prisma.workoutSet.create({
      data: { workoutId, ...dto },
      include: { exercise: true },
    });
  }

  async updateSet(userId: string, setId: string, dto: UpdateSetDto) {
    const set = await this.prisma.workoutSet.findUnique({
      where: { id: setId },
      include: { workout: true },
    });
    if (!set) throw new NotFoundException();
    if (set.workout.userId !== userId) throw new ForbiddenException();
    return this.prisma.workoutSet.update({ where: { id: setId }, data: dto });
  }

  async removeSet(userId: string, setId: string) {
    const set = await this.prisma.workoutSet.findUnique({
      where: { id: setId },
      include: { workout: true },
    });
    if (!set) throw new NotFoundException();
    if (set.workout.userId !== userId) throw new ForbiddenException();
    await this.prisma.workoutSet.delete({ where: { id: setId } });
    return { ok: true };
  }

  private async assertOwn(userId: string, workoutId: string) {
    const w = await this.prisma.workout.findUnique({ where: { id: workoutId } });
    if (!w) throw new NotFoundException();
    if (w.userId !== userId) throw new ForbiddenException();
    return w;
  }

  // Refresh per-exercise rolling stats: estimated 1RM (Epley), best, slope.
  private async updateExerciseStats(userId: string, workoutId: string) {
    const sets = await this.prisma.workoutSet.findMany({
      where: { workoutId, isWarmup: false, weightKg: { not: null }, reps: { not: null } },
    });
    const grouped = new Map<string, typeof sets>();
    for (const s of sets) {
      const arr = grouped.get(s.exerciseId) ?? [];
      arr.push(s);
      grouped.set(s.exerciseId, arr);
    }
    for (const [exerciseId, list] of grouped) {
      const top = list.reduce((acc, s) => {
        const e1rm = (s.weightKg ?? 0) * (1 + (s.reps ?? 0) / 30);
        return e1rm > acc.e1rm ? { e1rm, w: s.weightKg ?? 0, r: s.reps ?? 0 } : acc;
      }, { e1rm: 0, w: 0, r: 0 });

      const prev = await this.prisma.exerciseStat.findUnique({
        where: { userId_exerciseId: { userId, exerciseId } },
      });
      const slope = prev ? top.e1rm - prev.estimated1RM : 0;

      await this.prisma.exerciseStat.upsert({
        where: { userId_exerciseId: { userId, exerciseId } },
        create: {
          userId, exerciseId,
          estimated1RM: top.e1rm,
          bestWeight: top.w,
          bestReps: top.r,
          lastSetAt: new Date(),
          trendSlope: 0,
          sessionsCount: 1,
        },
        update: {
          estimated1RM: Math.max(prev?.estimated1RM ?? 0, top.e1rm),
          bestWeight: Math.max(prev?.bestWeight ?? 0, top.w),
          bestReps: top.r > (prev?.bestReps ?? 0) ? top.r : prev?.bestReps ?? top.r,
          lastSetAt: new Date(),
          trendSlope: slope,
          sessionsCount: (prev?.sessionsCount ?? 0) + 1,
        },
      });
    }
  }
}
