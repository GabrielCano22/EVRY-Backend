export type CivilDate = `${number}-${number}-${number}`;

export const APP_TIME_ZONE = 'America/Bogota' as const;

type CivilDateParts = {
  year: number;
  month: number;
  day: number;
};

type CivilTimeParts = CivilDateParts & {
  hour: number;
  minute: number;
  second: number;
};

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function civilDateFromParts({ year, month, day }: CivilDateParts): CivilDate {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new RangeError('La fecha civil no es válida.');
  }
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError('La fecha civil no es válida.');
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as CivilDate;
}

function civilParts(value: string): CivilDateParts {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('La fecha civil debe usar el formato AAAA-MM-DD.');
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  civilDateFromParts(parts);
  return parts;
}

function utcDate({ year, month, day, hour = 0, minute = 0, second = 0 }: Partial<CivilTimeParts> & CivilDateParts): Date {
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(hour, minute, second, 0);
  return value;
}

function formatter(timeZone: 'America/Bogota'): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function zonedParts(value: Date, timeZone: 'America/Bogota'): CivilTimeParts {
  if (Number.isNaN(value.getTime())) throw new RangeError('La fecha no es válida.');
  const values = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(value)
      .filter((part) => ['year', 'month', 'day', 'hour', 'minute', 'second'].includes(part.type))
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<keyof CivilTimeParts, number>;

  return values;
}

function zonedMidnight(parts: CivilDateParts, timeZone: 'America/Bogota'): Date {
  const localMidnightAsUtc = utcDate(parts);
  let candidate = localMidnightAsUtc;

  // Resolve the IANA offset at the target local day rather than assuming a
  // fixed UTC offset. This keeps the half-open interval valid if zone rules change.
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = zonedParts(candidate, timeZone);
    const offset = utcDate(local).getTime() - candidate.getTime();
    const next = new Date(localMidnightAsUtc.getTime() - offset);
    if (next.getTime() === candidate.getTime()) break;
    candidate = next;
  }

  const local = zonedParts(candidate, timeZone);
  if (local.year !== parts.year || local.month !== parts.month || local.day !== parts.day || local.hour !== 0) {
    throw new RangeError('No se pudo resolver el inicio local de la fecha civil.');
  }
  return candidate;
}

function nextCivilDate(value: CivilDate): CivilDate {
  const parts = civilParts(value);
  const next = utcDate(parts);
  next.setUTCDate(next.getUTCDate() + 1);
  return civilDateFromParts({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() });
}

export function parseCivilDate(value: string): Date {
  const canonical = civilDateFromParts(civilParts(value));
  const parsed = zonedMidnight(civilParts(canonical), APP_TIME_ZONE);
  if (formatCivilDate(parsed) !== canonical) throw new RangeError('La fecha civil no es válida.');
  return parsed;
}

export function formatCivilDate(value: Date): CivilDate {
  const { year, month, day } = zonedParts(value, APP_TIME_ZONE);
  return civilDateFromParts({ year, month, day });
}

export function todayCivilDate(timeZone: 'America/Bogota' = APP_TIME_ZONE, now: Date = new Date()): CivilDate {
  const { year, month, day } = zonedParts(now, timeZone);
  return civilDateFromParts({ year, month, day });
}

/**
 * Validates an inclusive civil-date range. Consumers must call
 * `civilDateBounds(to).toExclusive` only after this check, so `to` remains
 * inclusive at the API boundary and only becomes exclusive for database queries.
 */
export function assertCivilDateRange(from: CivilDate, to: CivilDate, today: CivilDate): void {
  const validFrom = civilDateFromParts(civilParts(from));
  const validTo = civilDateFromParts(civilParts(to));
  const validToday = civilDateFromParts(civilParts(today));

  if (validFrom > validTo) throw new RangeError('El inicio del rango no puede ser posterior al final.');
  if (validTo > validToday) throw new RangeError('El rango no puede incluir fechas futuras.');
}

export function civilDateBounds(
  value: CivilDate,
  timeZone: 'America/Bogota' = APP_TIME_ZONE,
): { from: Date; toExclusive: Date } {
  const canonical = civilDateFromParts(civilParts(value));
  const from = zonedMidnight(civilParts(canonical), timeZone);
  const toExclusive = zonedMidnight(civilParts(nextCivilDate(canonical)), timeZone);
  return { from, toExclusive };
}
