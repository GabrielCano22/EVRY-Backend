import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSetDto, CreateWorkoutDto, UpdateSetDto } from './workout.dto';

const uuidV4 = 'e9c3cf4e-d2c5-4cd5-96e3-eb9b1e005dde';

async function validateDto<T extends object>(type: new () => T, payload: object) {
  return validate(plainToInstance(type, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('workout DTOs', () => {
  it('requires a UUID v4 mutation id for every newly-created set', async () => {
    const missing = await validateDto(CreateSetDto, {
      exerciseId: 'exercise-1',
      order: 0,
      reps: 10,
    });
    const versionOne = await validateDto(CreateSetDto, {
      clientMutationId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      exerciseId: 'exercise-1',
      order: 0,
      reps: 10,
    });

    expect(missing.map(({ property }) => property)).toContain('clientMutationId');
    expect(versionOne.map(({ property }) => property)).toContain('clientMutationId');
  });

  it('accepts every supported set field inside its valid range', async () => {
    const errors = await validateDto(CreateSetDto, {
      clientMutationId: uuidV4,
      exerciseId: 'exercise-1',
      order: 0,
      weightKg: 0,
      reps: 0,
      durationS: 0,
      rpe: 10,
      techniqueStable: false,
      isWarmup: true,
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects negative measurements and RPE outside 1..10', async () => {
    const errors = await validateDto(CreateSetDto, {
      clientMutationId: uuidV4,
      exerciseId: 'exercise-1',
      order: -1,
      weightKg: -0.5,
      reps: -1,
      durationS: -1,
      rpe: 11,
    });

    expect(errors.map(({ property }) => property).sort()).toEqual([
      'durationS',
      'order',
      'reps',
      'rpe',
      'weightKg',
    ]);
  });

  it('allows nullable editable measurements and technique but keeps warmup boolean', async () => {
    const nullableErrors = await validateDto(UpdateSetDto, {
      weightKg: null,
      reps: null,
      durationS: null,
      rpe: null,
      techniqueStable: null,
      isWarmup: false,
    });
    const warmupErrors = await validateDto(UpdateSetDto, { isWarmup: null });

    expect(nullableErrors).toHaveLength(0);
    expect(warmupErrors.map(({ property }) => property)).toContain('isWarmup');
  });

  it('accepts an optional routine id when starting a workout', async () => {
    const errors = await validateDto(CreateWorkoutDto, {
      name: 'Piernas',
      notes: 'Controlada',
      routineId: 'routine-owned-by-user',
    });

    expect(errors).toHaveLength(0);
  });
});
