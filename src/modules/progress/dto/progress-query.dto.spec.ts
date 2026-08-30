import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivityQueryDto } from './activity-query.dto';
import { ExerciseProgressQueryDto } from './exercise-progress-query.dto';
import { OverviewQueryDto } from './overview-query.dto';

async function errorsFor<T extends object>(type: new () => T, value: Record<string, unknown>) {
  return validate(plainToInstance(type, value));
}

describe('progress query DTOs', () => {
  it('applies bounded exercise defaults and numeric transforms', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

    await expect(pipe.transform({}, { type: 'query', metatype: ExerciseProgressQueryDto }))
      .resolves.toMatchObject({ period: '30d', page: 1, limit: 10 });
    await expect(pipe.transform(
      { period: '1y', page: '2', limit: '25' },
      { type: 'query', metatype: ExerciseProgressQueryDto },
    )).resolves.toMatchObject({ period: '1y', page: 2, limit: 25 });
  });

  it.each([
    { period: 'week' },
    { page: 0 },
    { page: 1.5 },
    { limit: 0 },
    { limit: 26 },
  ])('rejects an invalid exercise query %#', async (value) => {
    await expect(errorsFor(ExerciseProgressQueryDto, value)).resolves.not.toHaveLength(0);
  });

  it('rejects unknown exercise parameters through the application pipe', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

    await expect(pipe.transform(
      { period: '30d', unexpected: 'value' },
      { type: 'query', metatype: ExerciseProgressQueryDto },
    )).rejects.toMatchObject({ status: 400 });
  });

  it('accepts an opaque history cursor and bounds its size', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform(
      { cursor: 'eyJ2IjoxfQ' }, { type: 'query', metatype: ExerciseProgressQueryDto },
    )).resolves.toMatchObject({ cursor: 'eyJ2IjoxfQ', page: 1 });
    await expect(errorsFor(ExerciseProgressQueryDto, { cursor: 'x'.repeat(513) }))
      .resolves.not.toHaveLength(0);
  });

  it('accepts every documented overview period and rejects unknown values', async () => {
    await expect(errorsFor(OverviewQueryDto, {})).resolves.toHaveLength(0);
    expect(plainToInstance(OverviewQueryDto, {})).toMatchObject({ period: '30d' });
    for (const period of ['30d', '90d', '6m', '1y', 'all']) {
      await expect(errorsFor(OverviewQueryDto, { period })).resolves.toHaveLength(0);
    }
    await expect(errorsFor(OverviewQueryDto, { period: 'week' })).resolves.not.toHaveLength(0);
  });

  it.each([
    { from: '2026-2-01', to: '2026-02-02' },
    { from: '2026-02-29', to: '2026-03-01' },
    { from: '2026-02-01', to: 'not-a-date' },
    { from: undefined, to: '2026-02-01' },
  ])('rejects malformed or missing civil activity dates %#', async (value) => {
    await expect(errorsFor(ActivityQueryDto, value)).resolves.not.toHaveLength(0);
  });

  it('accepts canonical Gregorian activity dates', async () => {
    await expect(errorsFor(ActivityQueryDto, { from: '2024-02-29', to: '2024-03-01' }))
      .resolves.toHaveLength(0);
  });
});
