import {
  resolveActivityWindow,
  resolveProgressPeriod,
} from './progress-period';

describe('progress periods in America/Bogota', () => {
  it('builds a 30 day half-open window and its contiguous previous window', () => {
    const period = resolveProgressPeriod('30d', new Date('2026-08-19T05:01:00.000Z'));

    expect(period).toEqual({
      key: '30d',
      from: '2026-07-21',
      to: '2026-08-19',
      timezone: 'America/Bogota',
      fromInclusive: new Date('2026-07-21T05:00:00.000Z'),
      toExclusive: new Date('2026-08-20T05:00:00.000Z'),
      previous: {
        from: '2026-06-21',
        to: '2026-07-20',
        fromInclusive: new Date('2026-06-21T05:00:00.000Z'),
        toExclusive: new Date('2026-07-21T05:00:00.000Z'),
      },
    });
  });

  it('uses the Bogota civil day instead of the UTC day around local midnight', () => {
    expect(resolveProgressPeriod('30d', new Date('2026-08-19T04:59:00.000Z')).to).toBe(
      '2026-08-18',
    );
    expect(resolveProgressPeriod('30d', new Date('2026-08-19T05:01:00.000Z')).to).toBe(
      '2026-08-19',
    );
    expect(resolveProgressPeriod('30d', new Date('2026-08-20T00:01:00.000Z')).to).toBe(
      '2026-08-19',
    );
  });

  it('builds a 90 day window with exactly 89 previous civil days', () => {
    const period = resolveProgressPeriod('90d', new Date('2026-01-01T17:00:00.000Z'));

    expect(period.from).toBe('2025-10-04');
    expect(period.to).toBe('2026-01-01');
    expect(period.previous).toMatchObject({ from: '2025-07-06', to: '2025-10-03' });
  });

  it('subtracts calendar months and clamps invalid month-end days', () => {
    const sixMonths = resolveProgressPeriod('6m', new Date('2026-08-31T17:00:00.000Z'));
    expect(sixMonths.from).toBe('2026-02-28');
    expect(sixMonths.previous).toMatchObject({ from: '2025-08-28', to: '2026-02-27' });

    const leapYear = resolveProgressPeriod('1y', new Date('2024-02-29T17:00:00.000Z'));
    expect(leapYear.from).toBe('2023-02-28');
    expect(leapYear.previous).toMatchObject({ from: '2022-02-28', to: '2023-02-27' });
  });

  it('keeps all history open on the left and without a comparison', () => {
    const period = resolveProgressPeriod('all', new Date('2026-12-31T17:00:00.000Z'));

    expect(period).toMatchObject({
      key: 'all',
      from: null,
      to: '2026-12-31',
      fromInclusive: null,
      toExclusive: new Date('2027-01-01T05:00:00.000Z'),
      previous: null,
    });
  });

  it('accepts at most 62 inclusive activity days and returns half-open bounds', () => {
    expect(
      resolveActivityWindow('2026-01-01', '2026-03-03', new Date('2026-12-31T17:00:00.000Z')),
    ).toEqual({
      from: '2026-01-01',
      to: '2026-03-03',
      fromInclusive: new Date('2026-01-01T05:00:00.000Z'),
      toExclusive: new Date('2026-03-04T05:00:00.000Z'),
    });
    expect(() =>
      resolveActivityWindow('2026-01-01', '2026-03-04', new Date('2026-12-31T17:00:00.000Z')),
    ).toThrow('El rango de actividad no puede superar 62 días.');
  });

  it.each([
    ['2026-02-29', '2026-03-01', 'La fecha civil no es válida.'],
    ['2026-03-02', '2026-03-01', 'El inicio del rango no puede ser posterior al final.'],
    ['2026-03-01', '2026-03-02', 'El rango no puede incluir fechas futuras.'],
  ])('rejects an invalid activity range from %s to %s', (from, to, message) => {
    expect(() =>
      resolveActivityWindow(from, to, new Date('2026-03-01T17:00:00.000Z')),
    ).toThrow(message);
  });
});
