-- Synthetic legacy data, before lifecycle/offline/stat-record migrations.
INSERT INTO "User" ("id", "email", "passwordHash", "name", "biologicalSex", "birthDate", "goals", "trackCycle", "updatedAt") VALUES
('migration-user-a', 'migration-a@example.test', 'synthetic-not-a-password', 'Usuario Á', 'MALE', '1995-02-28', ARRAY['STRENGTH']::"Goal"[], true, '2026-08-01'),
('migration-user-b', 'migration-b@example.test', 'synthetic-not-a-password', 'Usuario B', 'OTHER', NULL, ARRAY['MOBILITY']::"Goal"[], false, '2026-08-01');

INSERT INTO "Exercise" ("id", "name", "muscleGroup", "equipment", "isCustom", "ownerId", "sourceId", "imagePath", "gifPath", "attribution", "instructions") VALUES
('migration-lift', 'Sentadilla', 'QUADS', 'BARBELL', false, NULL, 'fixture-lift', '/exercises/fixture.jpg', '/exercises/fixture.gif', 'Atribución preservada', '{"es":"Instrucción"}'),
('migration-hold', 'Plancha propia', 'CORE', 'BODYWEIGHT', true, 'migration-user-a', NULL, NULL, NULL, NULL, NULL),
('migration-empty', 'Sin sesiones completadas', 'BACK', 'DUMBBELL', false, NULL, NULL, NULL, NULL, NULL, NULL);

INSERT INTO "Routine" ("id", "userId", "name", "dayOfWeek", "notes", "updatedAt") VALUES
('migration-routine-a', 'migration-user-a', 'Rutina A', 0, 'No borrar', '2026-08-01'),
('migration-routine-b', 'migration-user-b', 'Rutina B', NULL, NULL, '2026-08-01');
INSERT INTO "RoutineExercise" ("id", "routineId", "exerciseId", "order", "targetSets", "targetReps", "targetWeightKg", "seriesPlan", "notes") VALUES
('migration-routine-lift', 'migration-routine-a', 'migration-lift', 0, 2, 10, 60, '[{"reps":10,"weightKg":60}]', 'Conservar plan'),
('migration-routine-hold', 'migration-routine-a', 'migration-hold', 1, 1, NULL, NULL, '[{"durationS":60}]', NULL),
('migration-routine-b-lift', 'migration-routine-b', 'migration-lift', 0, 1, 5, 20, NULL, NULL);

INSERT INTO "Workout" ("id", "userId", "name", "startedAt", "endedAt", "routineId", "notes") VALUES
('migration-completed-1', 'migration-user-a', 'Histórica 1', '2026-08-01 12:00', '2026-08-01 13:00', 'migration-routine-a', 'Historial intacto'),
('migration-completed-2', 'migration-user-a', 'Histórica 2', '2026-08-02 12:00', '2026-08-02 13:00', 'migration-routine-a', NULL),
('migration-old-active', 'migration-user-a', 'Activa antigua', '2026-08-03 12:00', NULL, NULL, 'Borrador conservado'),
('migration-tied-active-a', 'migration-user-a', 'Empate A', '2026-08-04 12:00', NULL, NULL, NULL),
('migration-tied-active-z', 'migration-user-a', 'Empate Z', '2026-08-04 12:00', NULL, NULL, NULL),
('migration-other-active', 'migration-user-b', 'Otra cuenta', '2026-08-04 12:00', NULL, 'migration-routine-b', NULL);

INSERT INTO "WorkoutSet" ("id", "workoutId", "exerciseId", "order", "weightKg", "reps", "durationS", "rpe", "isWarmup", "completedAt") VALUES
('migration-set-1', 'migration-completed-1', 'migration-lift', 0, 60, 10, NULL, 7, false, '2026-08-01 12:10'),
('migration-set-2', 'migration-completed-1', 'migration-lift', 1, 80, 5, NULL, 8, false, '2026-08-01 12:20'),
('migration-set-3', 'migration-completed-2', 'migration-lift', 0, 70, 12, NULL, 9, false, '2026-08-02 12:10'),
('migration-set-4', 'migration-completed-2', 'migration-lift', 1, 80, 5, NULL, 8, false, '2026-08-02 12:20'),
('migration-set-warmup', 'migration-completed-2', 'migration-lift', 2, 200, 20, NULL, 1, true, '2026-08-02 12:30'),
('migration-set-duration', 'migration-completed-2', 'migration-hold', 0, NULL, NULL, 60, 6, false, '2026-08-02 12:40'),
('migration-set-invalid', 'migration-completed-2', 'migration-empty', 0, 300, 0, NULL, NULL, false, '2026-08-02 12:50'),
('migration-set-active', 'migration-old-active', 'migration-lift', 0, 400, 20, NULL, 10, false, '2026-08-03 12:10'),
('migration-set-other', 'migration-other-active', 'migration-empty', 0, 500, 20, NULL, 10, false, '2026-08-04 12:10');

-- Deliberately stale derived stats must be rebuilt, not treated as source data.
INSERT INTO "ExerciseStat" ("userId", "exerciseId", "estimated1RM", "bestWeight", "bestReps", "lastSetAt", "sessionsCount", "trendSlope") VALUES
('migration-user-a', 'migration-lift', 999, 999, 999, '2026-08-03 12:10', 99, 99),
('migration-user-b', 'migration-empty', 999, 999, 999, '2026-08-04 12:10', 99, 99);

INSERT INTO "CycleEntry" ("id", "userId", "date", "flow", "symptoms", "energy", "mood", "notes", "isPeriodStart") VALUES
('migration-cycle-first', 'migration-user-a', '2026-07-31', 'LIGHT', ARRAY['fatiga'], NULL, 4, 'Frontera de mes', true),
('migration-cycle-second', 'migration-user-a', '2026-08-01', 'NONE', ARRAY[]::TEXT[], 3, NULL, NULL, false);

-- 04:59 UTC belongs to the previous Bogotá day; duplicates remain recoverable.
INSERT INTO "Readiness" ("id", "userId", "date", "sleepHrs", "stress", "soreness", "motivation", "score") VALUES
('migration-ready-before-midnight', 'migration-user-a', '2026-08-02 04:59', 6, 3, 2, 4, 70),
('migration-ready-old', 'migration-user-a', '2026-08-02 05:00', 5, 4, 4, 2, 40),
('migration-ready-tie-a', 'migration-user-a', '2026-08-02 06:00', 7, 2, 1, 4, 80),
('migration-ready-tie-z', 'migration-user-a', '2026-08-02 06:00', 8, 1, 1, 5, 100),
('migration-ready-other', 'migration-user-b', '2026-08-02 05:00', 8, 1, 1, 5, 100);

INSERT INTO "RefreshToken" ("id", "userId", "tokenHash", "expiresAt", "revokedAt") VALUES
('migration-token-live', 'migration-user-a', 'synthetic-live-hash', '2026-10-01', NULL),
('migration-token-revoked', 'migration-user-b', 'synthetic-revoked-hash', '2026-10-01', '2026-08-01');
