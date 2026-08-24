import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertExercisesVisible, findVisibleExerciseOrThrow, visibleExerciseWhere } from './exercise-visibility';

describe('exercise visibility policy', () => {
  it('defines exactly global non-custom and owned custom exercises as visible', () => {
    expect(visibleExerciseWhere('user-1')).toEqual({
      OR: [
        { ownerId: null, isCustom: false },
        { ownerId: 'user-1', isCustom: true },
      ],
    });
  });

  it('deduplicates IDs and rejects a mixed invisible batch without exposing its cause', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'global' }]);
    const db = { exercise: { findMany } } as unknown as PrismaService;

    await expect(assertExercisesVisible(db, 'user-1', ['global', 'global', 'foreign'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          visibleExerciseWhere('user-1'),
          { id: { in: ['global', 'foreign'] } },
        ],
      },
      select: { id: true },
    });
  });

  it('does not query the database for an empty batch', async () => {
    const findMany = jest.fn();
    const db = { exercise: { findMany } } as unknown as PrismaService;

    await expect(assertExercisesVisible(db, 'user-1', [])).resolves.toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('turns both a foreign custom exercise and an absent exercise into not found', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const db = { exercise: { findFirst } } as unknown as PrismaService;

    await expect(findVisibleExerciseOrThrow(db, 'user-1', 'other-or-missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { AND: [visibleExerciseWhere('user-1'), { id: 'other-or-missing' }] },
    });
  });
});
