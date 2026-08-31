import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatedUserResponseDto, UserResponseDto } from './dto/user-response.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  @ApiOperation({ operationId: 'currentUser' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'The user profile no longer exists.', schema: { $ref: '#/components/schemas/ApiError' } })
  me(@CurrentUser() u: AuthUser) {
    return this.users.getProfile(u.id);
  }

  @Patch('me')
  @ApiOperation({ operationId: 'updateCurrentUser' })
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ type: UpdatedUserResponseDto })
  @ApiNotFoundResponse({ description: 'The user profile no longer exists.', schema: { $ref: '#/components/schemas/ApiError' } })
  update(@CurrentUser() u: AuthUser, @Body() dto: UpdateUserDto) {
    return this.users.update(u.id, dto);
  }
}
