import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RoutineExerciseDto } from './routine.dto';

describe('RoutineExerciseDto', () => {
  it('rejects a negative target weight', () => {
    const dto = plainToInstance(RoutineExerciseDto, {
      exerciseId: 'exercise-1',
      order: 0,
      targetSets: 3,
      targetWeightKg: -0.5,
    });

    expect(validateSync(dto).some((error) => error.property === 'targetWeightKg')).toBe(true);
  });
});
