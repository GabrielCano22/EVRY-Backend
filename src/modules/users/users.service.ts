import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, biologicalSex: true, birthDate: true,
        goals: true, trackCycle: true, avgCycleLen: true, avgPeriodLen: true, createdAt: true,
      },
    });
    if (!user) throw new NotFoundException();
    return user;
  }

  async update(userId: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
      select: {
        id: true, email: true, name: true, biologicalSex: true, birthDate: true,
        goals: true, trackCycle: true, avgCycleLen: true, avgPeriodLen: true,
      },
    });
  }
}
