import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Goal, Sex } from '@prisma/client';

/** Fields returned by the profile update's explicit Prisma selection. */
@ApiSchema({ name: 'UpdatedUser' })
export class UpdatedUserResponseDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, format: 'email' })
  email!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: Sex })
  biologicalSex!: Sex;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  birthDate!: Date | null;

  @ApiProperty({ enum: Goal, isArray: true })
  goals!: Goal[];

  @ApiProperty({ type: Boolean })
  trackCycle!: boolean;

  @ApiProperty({ type: 'integer' })
  avgCycleLen!: number;

  @ApiProperty({ type: 'integer' })
  avgPeriodLen!: number;
}

/** Profile reads also select the account creation timestamp. */
@ApiSchema({ name: 'User' })
export class UserResponseDto extends UpdatedUserResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
