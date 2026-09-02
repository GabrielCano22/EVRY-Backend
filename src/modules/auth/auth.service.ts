import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { Prisma, RefreshTokenPlatform } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const DUMMY_BCRYPT_HASH = '$2b$12$EeP/sfETTTWk4MPVu2UTLOeIbAN.OP1CE4bDsFHdHlgRqcecbiXxO';

class ConcurrentRefreshError extends Error {}

interface RefreshTokenWriter {
  refreshToken: {
    create(args: Prisma.RefreshTokenCreateArgs): Promise<unknown>;
  };
}

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

  async login(dto: LoginDto, platform: RefreshTokenPlatform = 'WEB') {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_BCRYPT_HASH);
    if (!user || !ok) throw new UnauthorizedException('Las credenciales no son válidas.');
    return this.issueTokens(user.id, user.email, platform);
  }

  async refresh(refreshToken?: string, platform: RefreshTokenPlatform = 'WEB') {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('El token de sesión no es válido o ya expiró.');
    }

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record) {
      throw new UnauthorizedException('El token de sesión no es válido o ya expiró.');
    }
    const invalid = record.revokedAt || record.expiresAt < new Date() || record.platform !== platform;
    if (invalid) {
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('El token de sesión no es válido o ya expiró.');
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rotation = await tx.refreshToken.updateMany({
            where: { id: record.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          if (rotation.count !== 1) throw new ConcurrentRefreshError();
          return this.issueTokens(
            record.user.id,
            record.user.email,
            platform,
            record.familyId,
            tx,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!(error instanceof ConcurrentRefreshError)) throw error;
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('El token de sesión no es válido o ya expiró.');
    }
  }

  async logout(
    refreshToken: string,
    platform: RefreshTokenPlatform = 'WEB',
  ) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true, platform: true },
    });
    if (record) {
      await this.revokeFamily(record.familyId);
      if (record.platform !== platform) {
        throw new UnauthorizedException('El token de sesión no es válido o ya expiró.');
      }
    }
    return { ok: true };
  }

  private async issueTokens(
    userId: string,
    email: string,
    platform: RefreshTokenPlatform = 'WEB',
    familyId: string = randomUUID(),
    db: RefreshTokenWriter = this.prisma,
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') ?? '15m') as JwtSignOptions['expiresIn'],
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const ttlDays = parseInt(
      (this.config.get<string>('JWT_REFRESH_TTL') ?? '30d').replace('d', ''),
      10,
    ) || 30;
    const expiresAt = new Date(Date.now() + ttlDays * 86400_000);

    await db.refreshToken.create({
      data: { userId, tokenHash, expiresAt, familyId, platform },
    });

    return { accessToken, refreshToken, expiresAt };
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
