import {
  assertCivilDateRange,
  civilDateBounds,
  formatCivilDate,
  parseCivilDate,
  todayCivilDate,
} from './civil-date';

describe('civil dates', () => {
  it('parses valid Gregorian dates at the start of their Bogota civil day', () => {
    expect(parseCivilDate('2024-02-29')).toEqual(new Date('2024-02-29T05:00:00.000Z'));
    expect(formatCivilDate(parseCivilDate('0001-01-01'))).toBe('0001-01-01');
  });

  it.each(['2025-02-29', '2026-13-01', '2026-04-31', '0000-01-01', '2026-2-01'])('rejects invalid civil date %s', (value) => {
    expect(() => parseCivilDate(value)).toThrow(RangeError);
  });

  it('uses Bogota instead of UTC at the 18:59 and 19:01 boundary', () => {
    expect(todayCivilDate('America/Bogota', new Date('2026-08-19T18:59:00-05:00'))).toBe('2026-08-19');
    expect(todayCivilDate('America/Bogota', new Date('2026-08-19T19:01:00-05:00'))).toBe('2026-08-19');
  });

  it('formats instants as their Bogota civil date', () => {
    expect(formatCivilDate(new Date('2026-08-20T00:01:00.000Z'))).toBe('2026-08-19');
    expect(() => formatCivilDate(new Date('invalid'))).toThrow(RangeError);
  });

  it('exposes the half-open local-day bounds through month and year ends', () => {
    const february = civilDateBounds('2024-02-29');
    expect(february.from).toEqual(new Date('2024-02-29T05:00:00.000Z'));
    expect(february.toExclusive).toEqual(new Date('2024-03-01T05:00:00.000Z'));

    const yearEnd = civilDateBounds('2026-12-31');
    expect(yearEnd.from).toEqual(new Date('2026-12-31T05:00:00.000Z'));
    expect(yearEnd.toExclusive).toEqual(new Date('2027-01-01T05:00:00.000Z'));
    expect(yearEnd.from.getTime()).toBeLessThan(yearEnd.toExclusive.getTime());
  });

  it('accepts a same-day inclusive range and rejects inverted or future ranges', () => {
    expect(() => assertCivilDateRange('2026-08-19', '2026-08-19', '2026-08-19')).not.toThrow();
    expect(() => assertCivilDateRange('2026-08-20', '2026-08-19', '2026-08-19')).toThrow(
      'El inicio del rango no puede ser posterior al final.',
    );
    expect(() => assertCivilDateRange('2026-08-19', '2026-08-20', '2026-08-19')).toThrow(
      'El rango no puede incluir fechas futuras.',
    );
  });
});
