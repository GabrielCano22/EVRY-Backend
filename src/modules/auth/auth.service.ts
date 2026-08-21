import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const DUMMY_BCRYPT_HASH = '$2b$12$EeP/sfETTTWk4MPVu2UTLOeIbAN.OP1CE4bDsFHdHlgRqcecbiXxO';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('El correo electrónico ya está registrado.');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        biologicalSex: dto.biologicalSex ?? 'PREFER_NOT_SAY',
        trackCycle: dto.trackCycle ?? false,
      },
    });
    return this.issueTokens(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_BCRYPT_HASH);
    if (!user || !ok) throw new UnauthorizedException('Las credenciales no son válidas.');
    return this.issueTokens(user.id, user.email);
  }

  async refresh(refreshToken?: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('El token de sesión no es válido o ya expiró.');
    }

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('El token de sesión no es válido o ya expiró.');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.user.id, record.user.email);
  }

  async logout(refreshToken: string) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken
      .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
    return { ok: true };
  }

  private async issueTokens(userId: string, email: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const ttlDays = parseInt(
      (this.config.get<string>('JWT_REFRESH_TTL') ?? '30d').replace('d', ''),
      10,
    ) || 30;
    const expiresAt = new Date(Date.now() + ttlDays * 86400_000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken, expiresAt };
  }
}
