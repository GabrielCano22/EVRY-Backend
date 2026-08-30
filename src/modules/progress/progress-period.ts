import {
  APP_TIME_ZONE,
  assertCivilDateRange,
  civilDateBounds,
  parseCivilDate,
  todayCivilDate,
  type CivilDate,
} from '../../common/dates/civil-date';
import type {
  ActivityWindow,
  ProgressPeriod,
  ProgressPeriodWindow,
} from './progress.types';

type DateParts = { year: number; month: number; day: number };

function parts(value: CivilDate): DateParts {
  parseCivilDate(value);
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function civilDate({ year, month, day }: DateParts): CivilDate {
  const value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as CivilDate;
  parseCivilDate(value);
  return value;
}

function nominalUtc(value: CivilDate): Date {
  const valueParts = parts(value);
  const date = new Date(0);
  date.setUTCFullYear(valueParts.year, valueParts.month - 1, valueParts.day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function fromNominalUtc(value: Date): CivilDate {
  return civilDate({
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  });
}

function shiftDays(value: CivilDate, amount: number): CivilDate {
  const date = nominalUtc(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return fromNominalUtc(date);
}

function subtractCalendarMonths(value: CivilDate, amount: number): CivilDate {
  const current = parts(value);
  const targetMonthIndex = current.year * 12 + current.month - 1 - amount;
  const year = Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12 + 1;
  if (year < 1) throw new RangeError('El periodo excede el límite de fechas admitido.');

  const firstOfFollowingMonth = new Date(0);
  firstOfFollowingMonth.setUTCFullYear(year, month, 1);
  firstOfFollowingMonth.setUTCHours(0, 0, 0, 0);
  firstOfFollowingMonth.setUTCDate(0);
  const day = Math.min(current.day, firstOfFollowingMonth.getUTCDate());
  return civilDate({ year, month, day });
}

function inclusiveDays(from: CivilDate, to: CivilDate): number {
  return Math.floor((nominalUtc(to).getTime() - nominalUtc(from).getTime()) / 86_400_000) + 1;
}

export function resolveProgressPeriod(
  key: ProgressPeriod,
  now: Date = new Date(),
): ProgressPeriodWindow {
  const to = todayCivilDate(APP_TIME_ZONE, now);
  const toExclusive = civilDateBounds(to, APP_TIME_ZONE).toExclusive;

  if (key === 'all') {
    return {
      key,
      from: null,
      to,
      timezone: APP_TIME_ZONE,
      fromInclusive: null,
      toExclusive,
      previous: null,
    };
  }

  const dayCount = key === '30d' ? 30 : key === '90d' ? 90 : null;
  const monthCount = key === '6m' ? 6 : key === '1y' ? 12 : null;
  if (dayCount === null && monthCount === null) {
    throw new RangeError('El periodo de progreso no es válido.');
  }

  const from = dayCount === null
    ? subtractCalendarMonths(to, monthCount as number)
    : shiftDays(to, -(dayCount - 1));
  const previousFrom = dayCount === null
    ? subtractCalendarMonths(from, monthCount as number)
    : shiftDays(from, -dayCount);
  const previousTo = shiftDays(from, -1);

  return {
    key,
    from,
    to,
    timezone: APP_TIME_ZONE,
    fromInclusive: civilDateBounds(from, APP_TIME_ZONE).from,
    toExclusive,
    previous: {
      from: previousFrom,
      to: previousTo,
      fromInclusive: civilDateBounds(previousFrom, APP_TIME_ZONE).from,
      toExclusive: civilDateBounds(previousTo, APP_TIME_ZONE).toExclusive,
    },
  };
}

export function resolveActivityWindow(
  fromValue: string,
  toValue: string,
  now: Date = new Date(),
): ActivityWindow {
  parseCivilDate(fromValue);
  parseCivilDate(toValue);
  const from = fromValue as CivilDate;
  const to = toValue as CivilDate;
  assertCivilDateRange(from, to, todayCivilDate(APP_TIME_ZONE, now));
  if (inclusiveDays(from, to) > 62) {
    throw new RangeError('El rango de actividad no puede superar 62 días.');
  }

  return {
    from,
    to,
    fromInclusive: civilDateBounds(from, APP_TIME_ZONE).from,
    toExclusive: civilDateBounds(to, APP_TIME_ZONE).toExclusive,
  };
}
