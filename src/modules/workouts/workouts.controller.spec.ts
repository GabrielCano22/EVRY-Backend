import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsService } from './workouts.service';

describe('WorkoutsController pagination', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const authenticatedGuard: CanActivate = {
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest().user = {
          id: 'user-1',
          email: 'user@example.test',
          biologicalSex: 'UNSPECIFIED',
          trackCycle: false,
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [WorkoutsController],
      providers: [{
        provide: WorkoutsService,
        useValue: {
          list: (_userId: string, take: number, skip: number) => ({ take, skip }),
        },
      }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authenticatedGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();
  });

  afterAll(async () => app?.close());

  it('applies safe defaults and transforms valid pagination values', async () => {
    await request(app.getHttpServer())
      .get('/workouts')
      .expect(200, { take: 20, skip: 0 });

    await request(app.getHttpServer())
      .get('/workouts?take=100&skip=10000')
      .expect(200, { take: 100, skip: 10000 });
  });

  it.each([
    'take=0',
    'take=101',
    'take=1.5',
    'take=not-a-number',
    'skip=-1',
    'skip=10001',
    'skip=1.5',
    'skip=not-a-number',
  ])('rejects unsafe pagination query %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/workouts?${query}`)
      .expect(400);
  });
});
