import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
