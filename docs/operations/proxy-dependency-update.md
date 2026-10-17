# Proxy dependency maintenance

Spec: integral EVRY security/CI plan, no deployment or real-data changes, authorized
worktree and codex/evry-optimization only. Preserve existing contracts and trust policy.

## Task 1: Reproduce and update the dependency

Reproduce the affected Express dependency's incorrectly trusted IPv4 hop with
short mapped IPv6 and zero-prefix IPv6 trust subnets. Add legitimate mapped-prefix
and default untrusted-header controls. Expected: malicious cases RED on 2.0.7.
Update only compatible proxy-addr lock resolution to upstream 2.0.8. Do not enable
proxy trust in EVRY or add a replacement library. Expected: all controls GREEN.

## Task 2: Corresponding CI verification

Run npm ci, Prisma validate/generate, OpenAPI check, non-mutating lint, test types,
build, root/unit tests, integration, populated migration/backup restoration and
compiled API performance using dedicated loopback PostgreSQL only. Expected: all
pass with contracts unchanged and no high/critical audit advisories. Record moderate
advisories honestly. No real database migrations, resets, EAS or deployment.

## Task 3: Review and publication

Small coherent local commit after all backend gates pass, then one fresh read-only
review of that exact range and authorized push only after resolving its findings.
Create/update the PR and inspect Actions for that SHA;
successful push is not successful CI. Frontend remains unpublished while its own
gates fail; never create empty frontend commits to satisfy cadence.

Review Focus: actual Express dependency resolution, malicious alternative address
forms, legitimate trust behavior, unchanged application trust and API contracts,
accidental dependency churn, proof and publication gates, synthetic database isolation.

The upstream [advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) affects
versions below 2.0.8. EVRY currently does not configure those vulnerable trust
subnets; a dependency advisory alone is not evidence that EVRY has been exploited.

## Verification record

On October 5, 2026 (America/Bogota), the two forged-header regressions failed on
2.0.7 while legitimate-prefix and default-trust controls passed. With 2.0.8, all
four passed. The lock diff changes only proxy-addr; no application trust setting,
API contract, manifest, database schema or migration was changed.

Fresh local checks passed: npm ci, Prisma validate/generate, unchanged generated
OpenAPI, non-mutating lint, test types, build, 432 unit tests, 83 integration tests
and eight populated-migration/backup-restoration tests. Database checks used only
dedicated loopback PostgreSQL port 55438 with the runtime database URL blocked.
Compiled hot API performance passed all 30 scenario groups with the existing
budgets and 95% confidence acceptance unchanged. The fixture contained 2,648
exercises, 1,000 sessions and 10,000 sets; all six application servers closed.
`npm audit --audit-level=high` passed: zero high/critical advisories, with 20
moderate advisories remaining. This is not a claim of a vulnerability-free tree.
