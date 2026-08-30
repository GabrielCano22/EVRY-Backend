import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SyncWorkoutDto } from './sync-workout.dto';

const workoutId = 'e9c3cf4e-d2c5-4cd5-96e3-eb9b1e005dde';
const syncId = '094ff5b5-f690-43ac-b3e6-b8a2b47cc924';
const setId = '59a1bef2-1b8d-4c36-a10e-7faeb7697672';

describe('SyncWorkoutDto', () => {
  it('acepta una sesión offline completa con eliminaciones explícitas', async () => {
    const dto = plainToInstance(SyncWorkoutDto, {
      clientId: workoutId,
      syncId,
      baseRevision: 0,
      name: 'Piernas offline',
      startedAt: '2026-08-28T15:00:00.000Z',
      status: 'COMPLETED',
      sets: [{
        clientId: setId,
        baseRevision: 0,
        exerciseId: 'exercise-1',
        order: 0,
        reps: 8,
        weightKg: 60,
      }],
      deletedSetClientIds: [],
    });

    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
      .resolves.toHaveLength(0);
  });

  it('rechaza UUID, revisiones, arrays y nombres fuera del contrato', async () => {
    const dto = plainToInstance(SyncWorkoutDto, {
      clientId: 'not-uuid',
      syncId,
      baseRevision: -1,
      name: 'x'.repeat(121),
      startedAt: 'not-a-date',
      status: 'UNKNOWN',
      sets: Array.from({ length: 251 }, () => ({})),
      deletedSetClientIds: ['not-uuid'],
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.map(({ property }) => property)).toEqual(expect.arrayContaining([
      'baseRevision',
      'clientId',
      'deletedSetClientIds',
      'name',
      'sets',
      'startedAt',
      'status',
    ]));
  });
});
