import { Equipment, MuscleGroup } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExercisesService } from './exercises.service';

const sourceExercise = {
  id: 'exercise-1',
  sourceId: '0001',
  name: '3/4 sit-up',
  muscleGroup: MuscleGroup.CORE,
  equipment: Equipment.BODYWEIGHT,
  category: 'waist',
  bodyPart: 'waist',
  target: 'abs',
  secondaryMuscles: ['lower back'],
  equipmentLabel: 'body weight',
  isCustom: false,
  ownerId: null,
  isCompound: false,
  tags: ['equipment_free'],
  description: null,
  mediaId: '2gPfomN',
  imagePath: 'images/0001-2gPfomN.jpg',
  gifPath: 'videos/0001-2gPfomN.gif',
  attribution: '© Gym visual — https://gymvisual.com/',
};

describe('ExercisesService', () => {
  beforeEach(() => {
    delete process.env.MEDIA_BASE_URL;
  });

  it('serializes local media paths without requiring a CDN', async () => {
    const prisma = {
      exercise: {
        findMany: jest.fn().mockResolvedValue([sourceExercise]),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;
    const service = new ExercisesService(prisma);

    await expect(service.list('user-1', {} as any)).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          imageUrl: '/media/exercises/images/0001-2gPfomN.jpg',
          gifUrl: '/media/exercises/videos/0001-2gPfomN.gif',
        }),
      ],
    });
  });

  it('uses the configured backend origin for absolute media URLs', async () => {
    process.env.MEDIA_BASE_URL = 'http://localhost:4000/';
    const findMany = jest.fn().mockResolvedValue([sourceExercise]);
    const prisma = {
      exercise: {
        findMany,
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;
    const service = new ExercisesService(prisma);

    await expect(
      service.list('user-1', { equipment: Equipment.BODYWEIGHT } as any),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          imageUrl: 'http://localhost:4000/media/exercises/images/0001-2gPfomN.jpg',
        }),
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }),
    );
  });

  it('returns a bounded page with metadata for the remaining catalog', async () => {
    const exercise = {
      id: 'ejercicio-31',
      sourceId: '31',
      name: 'Sentadilla',
      muscleGroup: MuscleGroup.QUADS,
      equipment: Equipment.BARBELL,
      category: 'Fuerza',
      bodyPart: 'Piernas',
      target: 'Cuádriceps',
      secondaryMuscles: [],
      equipmentLabel: 'Barra',
      isCustom: false,
      ownerId: null,
      isCompound: true,
      tags: [],
      description: null,
      mediaId: '0001',
      imagePath: 'images/0001.jpg',
      gifPath: 'videos/0001.gif',
      attribution: null,
    };
    const findMany = jest.fn().mockResolvedValue([exercise]);
    const count = jest.fn().mockResolvedValue(31);
    const prisma = { exercise: { findMany, count } } as unknown as PrismaService;
    const service = new ExercisesService(prisma);

    const result = await service.list('usuario-1', { page: 2, limit: 30 } as any);

    expect(result).toMatchObject({
      items: [
        {
          id: 'ejercicio-31',
          gifUrl: '/media/exercises/videos/0001.gif',
          imageUrl: '/media/exercises/images/0001.jpg',
        },
      ],
      page: 2,
      limit: 30,
      total: 31,
      hasMore: false,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 30, take: 30 }),
    );
  });

  it('combines target and equipment filters for focused muscle selection', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { exercise: { findMany, count } } as unknown as PrismaService;
    const service = new ExercisesService(prisma);

    await service.list('usuario-1', {
      category: 'back',
      target: 'lats',
      equipment: Equipment.BARBELL,
    } as any);

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { category: { equals: 'back', mode: 'insensitive' } },
        { target: { contains: 'lats', mode: 'insensitive' } },
        { equipment: Equipment.BARBELL },
      ]),
    );
  });

  it('only lists global non-custom exercises and custom exercises owned by the reader', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      exercise: { findMany, count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    const service = new ExercisesService(prisma);

    await service.list('usuario-1', {} as any);

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [
        { ownerId: null, isCustom: false },
        { ownerId: 'usuario-1', isCustom: true },
      ],
    });
  });

  it.each([
    ['custom orphan', { ...sourceExercise, isCustom: true, ownerId: null }],
    ['inconsistent owned non-custom', { ...sourceExercise, isCustom: false, ownerId: 'user-1' }],
  ])('hides an invisible %s behind the same not found response', async (_kind, exercise) => {
    const prisma = {
      exercise: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ExercisesService(prisma);

    await expect(service.getById('user-1', exercise.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
