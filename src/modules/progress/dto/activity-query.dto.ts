import {
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { parseCivilDate } from '../../../common/dates/civil-date';
import { ApiProperty } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'civilDate', async: false })
class CivilDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      parseCivilDate(value);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(arguments_: ValidationArguments): string {
    return `${arguments_.property} debe ser una fecha civil válida con formato AAAA-MM-DD`;
  }
}

export class ActivityQueryDto {
  @ApiProperty({ type: String, format: 'date', description: 'Inicio inclusivo del rango; máximo 62 días hasta to.' })
  @Validate(CivilDateConstraint)
  from!: string;

  @ApiProperty({ type: String, format: 'date', description: 'Final inclusivo; no puede superar el día actual en America/Bogota.' })
  @Validate(CivilDateConstraint)
  to!: string;
}
