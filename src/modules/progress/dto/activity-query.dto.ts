import {
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { parseCivilDate } from '../../../common/dates/civil-date';

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
  @Validate(CivilDateConstraint)
  from!: string;

  @Validate(CivilDateConstraint)
  to!: string;
}
