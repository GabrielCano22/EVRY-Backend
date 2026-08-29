import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ExercisesModule } from './modules/exercises/exercises.module';
import { WorkoutsModule } from './modules/workouts/workouts.module';
import { CycleModule } from './modules/cycle/cycle.module';
import { ProgressModule } from './modules/progress/progress.module';
import { AdaptiveModule } from './modules/adaptive/adaptive.module';
import { ReadinessModule } from './modules/readiness/readiness.module';
import { RoutinesModule } from './modules/routines/routines.module';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { SyncModule } from './modules/sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      errorMessage: 'Demasiadas solicitudes. Inténtalo más tarde.',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ExercisesModule,
    WorkoutsModule,
    CycleModule,
    ProgressModule,
    AdaptiveModule,
    ReadinessModule,
    RoutinesModule,
    HealthModule,
    SyncModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
