import { ApiProperty } from '@nestjs/swagger';
import { Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { parseCivilDate } from '../../../common/dates/civil-date';

@ValidatorConstraint({ name: 'calendarCivilDate', async: false })
class CalendarCivilDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try { parseCivilDate(value); return true; } catch { return false; }
  }
  defaultMessage(): string { return 'debe ser una fecha civil válida con formato AAAA-MM-DD'; }
}

export class CycleCalendarQueryDto {
  @ApiProperty({ type: String, format: 'date', description: 'Inicio inclusivo; rango máximo de 62 días.' })
  @Validate(CalendarCivilDateConstraint)
  from!: string;

  @ApiProperty({ type: String, format: 'date', description: 'Fin inclusivo; puede ser futuro para proyecciones.' })
  @Validate(CalendarCivilDateConstraint)
  to!: string;
}
