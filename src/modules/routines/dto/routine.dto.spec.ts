import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import {
  CreateRoutineDto,
  RoutineExerciseDto,
  UpdateRoutineDto,
} from './routine.dto';

const validExercise = (overrides: Record<string, unknown> = {}) => ({
  exerciseId: 'exercise-1',
  order: 0,
  targetSets: 3,
  ...overrides,
});

const propertyError = (errors: ValidationError[], property: string) =>
  errors.find((error) => error.property === property);

const expectConstraint = (
  errors: ValidationError[],
  property: string,
  constraint: string,
) => {
  expect(propertyError(errors, property)?.constraints).toHaveProperty(constraint);
};

describe('RoutineExerciseDto', () => {
  it('accepts an exercise id with 64 characters', () => {
    const dto = plainToInstance(RoutineExerciseDto, validExercise({ exerciseId: 'e'.repeat(64) }));

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects an exercise id with 65 characters at the DTO boundary', () => {
    const dto = plainToInstance(RoutineExerciseDto, validExercise({ exerciseId: 'e'.repeat(65) }));

    expectConstraint(validateSync(dto), 'exerciseId', 'maxLength');
  });

  it('rejects a negative target weight', () => {
    const dto = plainToInstance(RoutineExerciseDto, validExercise({ targetWeightKg: -0.5 }));

    expectConstraint(validateSync(dto), 'targetWeightKg', 'min');
  });

  it('accepts a target weight of 500 kilograms', () => {
    const dto = plainToInstance(RoutineExerciseDto, validExercise({ targetWeightKg: 500 }));

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a target weight above 500 kilograms at the DTO boundary', () => {
    const dto = plainToInstance(RoutineExerciseDto, validExercise({ targetWeightKg: 500.1 }));

    expectConstraint(validateSync(dto), 'targetWeightKg', 'max');
  });

  it('accepts a nested series plan with 20 rows', () => {
    const dto = plainToInstance(
      RoutineExerciseDto,
      validExercise({ seriesPlan: Array.from({ length: 20 }, () => ({ reps: 1, weightKg: 0 })) }),
    );

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a nested series plan with 21 rows at the DTO boundary', () => {
    const dto = plainToInstance(
      RoutineExerciseDto,
      validExercise({ seriesPlan: Array.from({ length: 21 }, () => ({ reps: 1, weightKg: 0 })) }),
    );

    expectConstraint(validateSync(dto), 'seriesPlan', 'arrayMaxSize');
  });

  it('accepts notes with 2,000 characters', () => {
    const dto = plainToInstance(RoutineExerciseDto, validExercise({ notes: 'n'.repeat(2000) }));

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts null to clear exercise notes', () => {
    const dto = plainToInstance(RoutineExerciseDto, validExercise({ notes: null }));

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects notes with 2,001 characters at the DTO boundary', () => {
    const dto = plainToInstance(RoutineExerciseDto, validExercise({ notes: 'n'.repeat(2001) }));

    expectConstraint(validateSync(dto), 'notes', 'maxLength');
  });
});

describe('CreateRoutineDto', () => {
  it('accepts a required name with the minimum length of one', () => {
    const dto = plainToInstance(CreateRoutineDto, { name: 'r', exercises: [validExercise()] });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects an empty required name at the DTO boundary', () => {
    const dto = plainToInstance(CreateRoutineDto, { name: '', exercises: [validExercise()] });

    expectConstraint(validateSync(dto), 'name', 'minLength');
  });

  it('accepts a name with 120 characters', () => {
    const dto = plainToInstance(CreateRoutineDto, { name: 'r'.repeat(120), exercises: [validExercise()] });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a name with 121 characters at the DTO boundary', () => {
    const dto = plainToInstance(CreateRoutineDto, { name: 'r'.repeat(121), exercises: [validExercise()] });

    expectConstraint(validateSync(dto), 'name', 'maxLength');
  });

  it('accepts optional notes with 2,000 characters', () => {
    const dto = plainToInstance(CreateRoutineDto, {
      name: 'routine',
      notes: 'n'.repeat(2000),
      exercises: [validExercise()],
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts null routine notes', () => {
    const dto = plainToInstance(CreateRoutineDto, {
      name: 'routine',
      notes: null,
      exercises: [validExercise()],
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects optional notes with 2,001 characters at the DTO boundary', () => {
    const dto = plainToInstance(CreateRoutineDto, {
      name: 'routine',
      notes: 'n'.repeat(2001),
      exercises: [validExercise()],
    });

    expectConstraint(validateSync(dto), 'notes', 'maxLength');
  });

  it('accepts 100 nested exercises', () => {
    const dto = plainToInstance(CreateRoutineDto, {
      name: 'routine',
      exercises: Array.from({ length: 100 }, (_, order) => validExercise({ order })),
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects 101 nested exercises at the DTO boundary', () => {
    const dto = plainToInstance(CreateRoutineDto, {
      name: 'routine',
      exercises: Array.from({ length: 101 }, (_, order) => validExercise({ order })),
    });

    expectConstraint(validateSync(dto), 'exercises', 'arrayMaxSize');
  });
});

describe('UpdateRoutineDto', () => {
  it('accepts a present name in the one to 120 character range', () => {
    const minimum = plainToInstance(UpdateRoutineDto, { name: 'r' });
    const maximum = plainToInstance(UpdateRoutineDto, { name: 'r'.repeat(120) });

    expect(validateSync(minimum)).toHaveLength(0);
    expect(validateSync(maximum)).toHaveLength(0);
  });

  it('rejects an empty present name at the DTO boundary', () => {
    const dto = plainToInstance(UpdateRoutineDto, { name: '' });

    expectConstraint(validateSync(dto), 'name', 'minLength');
  });

  it('rejects a present name with 121 characters at the DTO boundary', () => {
    const dto = plainToInstance(UpdateRoutineDto, { name: 'r'.repeat(121) });

    expectConstraint(validateSync(dto), 'name', 'maxLength');
  });

  it('accepts optional notes with 2,000 characters', () => {
    const dto = plainToInstance(UpdateRoutineDto, { notes: 'n'.repeat(2000) });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts null to clear routine notes', () => {
    const dto = plainToInstance(UpdateRoutineDto, { notes: null });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects optional notes with 2,001 characters at the DTO boundary', () => {
    const dto = plainToInstance(UpdateRoutineDto, { notes: 'n'.repeat(2001) });

    expectConstraint(validateSync(dto), 'notes', 'maxLength');
  });

  it('accepts 100 nested exercises', () => {
    const dto = plainToInstance(UpdateRoutineDto, {
      exercises: Array.from({ length: 100 }, (_, order) => validExercise({ order })),
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects 101 nested exercises at the DTO boundary', () => {
    const dto = plainToInstance(UpdateRoutineDto, {
      exercises: Array.from({ length: 101 }, (_, order) => validExercise({ order })),
    });

    expectConstraint(validateSync(dto), 'exercises', 'arrayMaxSize');
  });
});
