import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Exercise, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { ListExercisesDto } from './dto/list-exercises.dto';

const listSelect = {
  id: true,
  sourceId: true,
  name: true,
  muscleGroup: true,
  equipment: true,
  category: true,
  bodyPart: true,
  target: true,
  secondaryMuscles: true,
  equipmentLabel: true,
  isCustom: true,
  ownerId: true,
  isCompound: true,
  tags: true,
  description: true,
  mediaId: true,
  imagePath: true,
  gifPath: true,
  attribution: true,
} satisfies Prisma.ExerciseSelect;

type ExerciseListItem = Prisma.ExerciseGetPayload<{ select: typeof listSelect }>;

@Injectable()
export class ExercisesService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string, opts: ListExercisesDto) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 30;
    const where: Prisma.ExerciseWhereInput = {
      AND: [
        // Los 1.324 ejercicios del catálogo oficial tienen sourceId y medios
        // locales. Conservamos los ejercicios antiguos sin sourceId para
        // datos históricos, pero no los mostramos en el selector porque no
        // tienen GIF/JPG asociados.
        { OR: [{ sourceId: { not: null } }, { ownerId: userId }] },
        opts.muscleGroup ? { muscleGroup: opts.muscleGroup } : {},
        opts.equipment ? { equipment: opts.equipment } : {},
        opts.category ? { category: { equals: opts.category, mode: 'insensitive' } } : {},
        opts.q
          ? {
              OR: [
                { name: { contains: opts.q, mode: 'insensitive' } },
                { target: { contains: opts.q, mode: 'insensitive' } },
                { bodyPart: { contains: opts.q, mode: 'insensitive' } },
                { equipmentLabel: { contains: opts.q, mode: 'insensitive' } },
              ],
            }
          : {},
        opts.tag ? { tags: { has: opts.tag } } : {},
      ],
    };
    const [exercises, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        select: listSelect,
        orderBy: [{ isCustom: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return {
      items: exercises.map((exercise) => this.serialize(exercise)),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  async getById(userId: string, id: string) {
    const ex = await this.prisma.exercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException();
    if (ex.ownerId && ex.ownerId !== userId) throw new ForbiddenException();
    return this.serialize(ex);
  }

  create(userId: string, dto: CreateExerciseDto) {
    return this.prisma.exercise.create({
      data: { ...dto, isCustom: true, ownerId: userId, tags: dto.tags ?? [] },
    }).then((exercise) => this.serialize(exercise));
  }

  async remove(userId: string, id: string) {
    const ex = await this.prisma.exercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException();
    if (ex.ownerId !== userId) throw new ForbiddenException();
    await this.prisma.exercise.delete({ where: { id } });
    return { ok: true };
  }

  private serialize(exercise: Exercise | ExerciseListItem) {
    return {
      ...exercise,
      imageUrl: this.mediaUrl(exercise.imagePath),
      gifUrl: this.mediaUrl(exercise.gifPath),
    };
  }

  private mediaUrl(path: string | null | undefined) {
    if (!path) return null;
    const base = process.env.MEDIA_BASE_URL?.trim().replace(/\/+$/, '');
    return `${base ?? ''}/media/exercises/${path.replace(/^\/+/, '')}`;
  }
}
