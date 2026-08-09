import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.users.getProfile(u.id);
  }

  @Patch('me')
  update(@CurrentUser() u: AuthUser, @Body() dto: UpdateUserDto) {
    return this.users.update(u.id, dto);
  }
}
