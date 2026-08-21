import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSetDto } from './workout.dto';

describe('CreateSetDto', () => {
  const legacyPayload = { exerciseId: 'exercise-1', order: 0, reps: 10 };

  it('acepta el payload legacy sin los campos de idempotencia o técnica', async () => {
    const errors = await validate(plainToInstance(CreateSetDto, legacyPayload));

    expect(errors).toHaveLength(0);
  });

  it('acepta UUID de mutación y estado estable de técnica opcionales', async () => {
    const errors = await validate(plainToInstance(CreateSetDto, {
      ...legacyPayload,
      clientMutationId: 'e9c3cf4e-d2c5-4cd5-96e3-eb9b1e005dde',
      techniqueStable: true,
    }));

    expect(errors).toHaveLength(0);
  });

  it('rechaza un clientMutationId que no sea UUID', async () => {
    const errors = await validate(plainToInstance(CreateSetDto, {
      ...legacyPayload,
      clientMutationId: 'no-es-un-uuid',
    }));

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('clientMutationId');
  });
});
