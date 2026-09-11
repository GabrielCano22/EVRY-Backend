# EVRY backend routine input-bound hardening

## Goal

Close the remaining routine DTO denial-of-service and contract gaps by enforcing the same bounded inputs already used by the mobile editor, without changing stored data or routine transaction semantics.

## Global Constraints

- Work only in `C:\Users\gabri\.codex\worktrees\EVRY-optimization\backend` on `codex/evry-optimization`.
- Do not run migrations, modify real data, deploy, push, or merge during implementation.
- Preserve existing create/update behavior and use class-validator decorators so the global validation pipe rejects oversized payloads before service/database work.
- Keep existing valid boundaries accepted; test each one-past boundary with real DTO validation.
- Regenerate and commit OpenAPI artifacts if validation metadata changes the document.
- Follow strict TDD and finish with focused tests, the full unit suite, lint, type-check, build, Prisma validate/generate, and OpenAPI check.

### Task 1: Bound every routine input

**Files:**

- Modify `src/modules/routines/dto/routine.dto.ts`.
- Expand `src/modules/routines/dto/routine.dto.spec.ts`.
- Update generated files under `openapi/` only through the repository generator.

**Requirements:**

1. `RoutineExerciseDto.exerciseId` accepts strings through 64 characters and rejects 65.
2. `RoutineExerciseDto.targetWeightKg` keeps its current numeric/minimum behavior, accepts 500, and rejects values above 500.
3. `RoutineExerciseDto.seriesPlan` accepts at most 20 rows and rejects 21 before service work.
4. `RoutineExerciseDto.notes` accepts 2,000 characters and rejects 2,001.
5. `CreateRoutineDto.name` remains required with minimum length 1, accepts 120 characters, and rejects 121. Its optional notes accept at most 2,000 characters. Its exercises array accepts at most 100 rows and rejects 101.
6. `UpdateRoutineDto.name`, when present, uses the same 1–120 range so an empty update name is rejected. Its notes and exercises use the same 2,000/100 maxima as create.
7. Do not add destructive schema changes or alter routine service transactions. Do not reduce existing `targetReps`, per-series reps, `targetSets`, weekday, or weight minima.
8. Tests use `plainToInstance` plus real `class-validator` validation and assert the failing property/constraint at the DTO boundary. They must cover every accepted boundary and every rejection above, including nested array validation.

**Acceptance:**

- Focused DTO tests pass with pristine output.
- `npm run test:unit`, `npm run lint`, `npm run test:type-check`, `npm run build`, `npm run prisma:validate`, `npm run prisma:generate`, and `npm run openapi:check` pass.
- Work is self-reviewed and committed with `Feat: Se agrega "<acción realizada en este módulo>"`.

