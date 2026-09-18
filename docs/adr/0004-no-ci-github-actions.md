# ADR 0004: No GitHub Actions CI; local verification gates

- Status: accepted; the only GitHub Actions workflow is the Pages deployment (ADR 0009)
- Date: 2026-09-18
- Supersedes: the earlier requirement for GitHub Actions on Node 24, SoftHSM2 tests in CI, and provenance/fuzz/release gates in CI

## Decision

The repository ships **no** GitHub Actions workflows. Every automated check runs as a repository-local `pnpm` script or a manual verification step, and the results are recorded.

Supporting detail:

- `.github/` contains no workflow files; `scripts/release-dry-run.ts` rejects the appearance of CI workflows so a workflow cannot be reintroduced accidentally.
- The verification commands (`pnpm lint`, `typecheck`, `test:all`, `test:property`, `test:fuzz`, `test:mutation`, `project:audit`, `final:*`, `pades:validate`, `sbom:check`, `release:dry-run`) are the evidence set.
- Release provenance, signed tags and trusted publishing are not provided by the repository; they remain manual release steps rather than being silently claimed.

## Rationale

The project is developed with an offline-capable workflow where a hosted runner is not guaranteed and adding a CI provider would create a second, less visible trust boundary for signing material, provenance and network access. Keeping checks local makes the same commands runnable in an air-gapped environment and keeps the evidence reproducible without a third-party service.

## Consequences

- Release provenance, signed-release processes, and fuzz/property/mutation tests in continuous integration are not provided by the repository; they are handled as local, manual steps.
- There is no automatic protection against a regression that a developer forgets to run locally. The `project:audit` check fails closed when evidence is absent to compensate.
- Restoring CI later requires a new ADR that also restores the corresponding release/provenance controls.
