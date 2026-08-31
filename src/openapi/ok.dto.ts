import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'Ok' })
export class OkDto {
  @ApiProperty({ type: Boolean }) ok!: boolean;
}
