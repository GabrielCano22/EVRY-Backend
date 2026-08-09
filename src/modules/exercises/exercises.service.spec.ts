import { Equipment, MuscleGroup } from '@prisma/client';
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
      },
    };
    const service = new ExercisesService(prisma as never);

    await expect(service.list('user-1', {})).resolves.toEqual([
      expect.objectContaining({
        imageUrl: '/media/exercises/images/0001-2gPfomN.jpg',
        gifUrl: '/media/exercises/videos/0001-2gPfomN.gif',
      }),
    ]);
    const query = prisma.exercise.findMany.mock.calls[0][0];
    expect(query.select).not.toHaveProperty('instructions');
    expect(query.select).not.toHaveProperty('instructionSteps');
  });

  it('uses the configured backend origin for absolute media URLs', async () => {
    process.env.MEDIA_BASE_URL = 'http://localhost:4000/';
    const prisma = {
      exercise: {
        findMany: jest.fn().mockResolvedValue([sourceExercise]),
      },
    };
    const service = new ExercisesService(prisma as never);

    await expect(service.list('user-1', { equipment: Equipment.BODYWEIGHT })).resolves.toEqual([
      expect.objectContaining({ imageUrl: 'http://localhost:4000/media/exercises/images/0001-2gPfomN.jpg' }),
    ]);
    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }),
    );
  });
});
