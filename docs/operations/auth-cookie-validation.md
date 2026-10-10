# Authentication cookie input boundary

Spec: EVRY's strict browser authentication, uniform errors, hostile-input
validation and data-preservation requirements. Authorized backend worktree only;
no deployment, remote resources, real data, relaxed tests or audit exceptions.

## Task 1: Reject decoded non-string refresh cookies safely

Read the actual cookie-parser/controller/service boundary. JSON cookies can be
decoded into objects, arrays, numbers or booleans despite the service's string
annotation. First pass real cookie-parser decoded values into the actual auth
service and observe non-authentication exceptions before any fix. Expected RED:
refresh calls trim on a non-string; logout sends it into SHA256. No database
access is necessary for rejecting invalid types. Add the smallest runtime type
guard before normalization/hashing, preserving ordinary strings, missing-refresh
401, idempotent unknown-string logout, rotation and platform/family behavior.
Verify both methods reject malicious-shaped JSON cookies with UnauthorizedException
instead of an unexpected error, without exposing cookie contents or accessing
storage. No claim of auth bypass, data disclosure or exploitable DoS from this
bounded error-handling defect. Expected GREEN: focused existing origin/cookie/
auth-service/controller tests, whole unit suite, types/lint/build, Prisma and
OpenAPI unchanged. Keep all original tests/assertions and failed evidence.

## Task 2: Verify integration and publication gates

Use only the existing guarded synthetic loopback test database/cluster, preserving
it and all real data. Run the corresponding CI migration/integration/audit gates
before publishing. Verify no contract artifact changes; frontend pin changes
only after exact-SHA backend push/CI succeeds. A clean backend permits no empty
commit. Do not push if a relevant gate fails, and do not claim acceptance from
unit-only evidence. Update the existing PR and inspect exact-SHA push/PR Actions
after an authorized push. No merging/deployment/environment or remote database
creation inferred. The full objective remains open for all frontend/performance/
physical-device gates. Final whole-branch review policy still applies separately.

## Local verification — 2026-10-07

The runtime guards reject non-string cookies before trimming, hashing or storage
access. Real cookie-parser characterization reproduced both service failures
before the fix. The HTTP regression exercises refresh and logout with five JSON
cookie shapes and verifies that an unrelated genuine mobile session is unchanged.

The checked working tree passed 443 unit tests, 84 integration tests, eight
populated-database migration cases and the compiled API benchmark. All 30 warmed
synthetic benchmark scenarios met their existing confidence-based budgets;
the report records no errors and six closed application servers. Prisma,
types, non-mutating lint, build and unchanged OpenAPI checks also passed. The
backend audit reported no high or critical advisories, but 20 moderate advisories
remain. The dedicated loopback PostgreSQL cluster was stopped after these checks;
its data and verification artifacts were preserved.

These are local working-tree results, not a published commit, GitHub Actions
result, deployment or complete-project acceptance. Whole-branch final review
and publication remain pending; frontend dependency/performance gates and
physical-device acceptance are not certified by this backend verification.
