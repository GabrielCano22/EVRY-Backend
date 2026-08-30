import { Equipment, MuscleGroup, Routine, RoutineExercise } from '@prisma/client';
import { createPrismaClient } from '../src/prisma/prisma-client';
import { randomUUID } from 'node:crypto';
import { RoutinesService } from '../src/modules/routines/routines.service';
import { ServicioSesionActiva } from '../src/modules/workouts/servicio-sesion-activa';

const rollbackFunction = 'test_routine_exercise_rollback_failure';
const rollbackTrigger = 'test_routine_exercise_rollback_trigger';

type RoutineWithExercises = Routine & { exercises: RoutineExercise[] };

function snapshotRoutine(routine: RoutineWithExercises) {
  return {
    name: routine.name,
    dayOfWeek: routine.dayOfWeek,
    notes: routine.notes,
    exercises: routine.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      order: exercise.order,
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      targetWeightKg: exercise.targetWeightKg,
      seriesPlan: exercise.seriesPlan,
      notes: exercise.notes,
    })),
  };
}

describe('RoutinesService PostgreSQL transaction rollback', () => {
  const prisma = createPrismaClient();
  const service = new RoutinesService(prisma as never, {} as ServicioSesionActiva);
  const fixtureExerciseIds: string[] = [];
  let fixtureUserId: string | undefined;

  async function removeRollbackTrigger(): Promise<void> {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${rollbackTrigger}" ON "RoutineExercise"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${rollbackFunction}"()`);
  }

  beforeAll(async () => {
    expect(process.env.TEST_DATABASE_URL).toBeDefined();
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL?.trim());
    await prisma.$connect();
    await removeRollbackTrigger();
  });

  afterAll(async () => {
    let cleanupFailure: unknown;

    try {
      await removeRollbackTrigger();
    } catch (error) {
      cleanupFailure = error;
    }

    try {
      if (fixtureUserId) await prisma.user.deleteMany({ where: { id: fixtureUserId } });
    } catch (error) {
      cleanupFailure ??= error;
    }

    try {
      if (fixtureExerciseIds.length > 0) {
        await prisma.exercise.deleteMany({ where: { id: { in: fixtureExerciseIds } } });
      }
    } catch (error) {
      cleanupFailure ??= error;
    } finally {
      await prisma.$disconnect();
    }

    if (cleanupFailure) throw cleanupFailure;
  });

  it('keeps the former header and exercise plan when PostgreSQL rejects the replacement insert', async () => {
    const runId = randomUUID();
    const rollbackMarker = `task-1-rollback-${runId}`;
    const oldSeriesPlan = [
      { reps: 12, weightKg: 20 },
      { reps: 10, weightKg: 22.5 },
    ];
    const oldExercise = await prisma.exercise.create({
      data: {
        name: `Old routine exercise ${runId}`,
        muscleGroup: MuscleGroup.CORE,
        equipment: Equipment.BODYWEIGHT,
        isCustom: false,
      },
    });
    const replacementExercise = await prisma.exercise.create({
      data: {
        name: `Replacement routine exercise ${runId}`,
        muscleGroup: MuscleGroup.BACK,
        equipment: Equipment.DUMBBELL,
        isCustom: false,
      },
    });
    fixtureExerciseIds.push(oldExercise.id, replacementExercise.id);

    const user = await prisma.user.create({
      data: {
        email: `routine-rollback-${runId}@example.test`,
        name: 'Routine rollback integration fixture',
        passwordHash: 'not-a-real-password-hash',
      },
    });
    fixtureUserId = user.id;

    const routine = await prisma.routine.create({
      data: {
        userId: user.id,
        name: 'Cabecera original',
        dayOfWeek: 2,
        notes: 'Notas originales',
        exercises: {
          create: {
            exerciseId: oldExercise.id,
            order: 4,
            targetSets: 2,
            targetReps: 12,
            targetWeightKg: 20,
            seriesPlan: oldSeriesPlan,
            notes: 'Ejercicio original',
          },
        },
      },
    });

    const before = await prisma.routine.findUniqueOrThrow({
      where: { id: routine.id },
      include: { exercises: { orderBy: { order: 'asc' } } },
    });
    const beforeSnapshot = snapshotRoutine(before);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${rollbackFunction}"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW."notes" = '${rollbackMarker}' THEN
          RAISE EXCEPTION 'task 1 rollback trigger';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${rollbackTrigger}"
      BEFORE INSERT ON "RoutineExercise"
      FOR EACH ROW EXECUTE FUNCTION "${rollbackFunction}"();
    `);

    await expect(
      service.update(user.id, routine.id, {
        name: 'Cabecera que no debe persistir',
        dayOfWeek: 5,
        notes: 'Notas que no deben persistir',
        exercises: [{
          exerciseId: replacementExercise.id,
          order: 0,
          targetSets: 1,
          targetReps: 8,
          targetWeightKg: 30,
          seriesPlan: [{ reps: 8, weightKg: 30 }],
          notes: rollbackMarker,
        }],
      }),
    ).rejects.toThrow('task 1 rollback trigger');

    const after = await prisma.routine.findUniqueOrThrow({
      where: { id: routine.id },
      include: { exercises: { orderBy: { order: 'asc' } } },
    });

    expect(snapshotRoutine(after)).toEqual(beforeSnapshot);
    expect(snapshotRoutine(after)).toEqual({
      name: 'Cabecera original',
      dayOfWeek: 2,
      notes: 'Notas originales',
      exercises: [{
        exerciseId: oldExercise.id,
        order: 4,
        targetSets: 2,
        targetReps: 12,
        targetWeightKg: 20,
        seriesPlan: oldSeriesPlan,
        notes: 'Ejercicio original',
      }],
    });
    expect(after.exercises.some((exercise) => exercise.exerciseId === replacementExercise.id)).toBe(false);
  });
});
