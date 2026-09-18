# ADR 0004: No GitHub Actions CI; local and owner-run gates

- Status: superseded by ADR 0009 for the public OSS repository (the local-first gates remain)
- Date: 2026-09-18
- Supersedes: the CI requirement in spec §18 (GitHub Actions on Node 24), §19 (SoftHSM2 "in CI") and §21 ("in CI" provenance/fuzz/release gates)

## Decision

The repository ships **no** GitHub Actions workflows. The milestone execution plan's global constraint ("CI: none") is the governing decision. Every automated gate that the locked spec said should run "in CI" instead runs as a repository-local `pnpm` script or an
owner-run manual gate, and the results are recorded in the phase verification reports.

Supporting detail:

- `.github/` contains no workflow files; `scripts/release-dry-run.ts` rejects the appearance of CI workflows so a workflow cannot be reintroduced accidentally.
- Phase 10 and Phase 12 gates (`pnpm lint`, `typecheck`, `test:all`, `test:property`, `test:fuzz`, `test:mutation`, `project:audit`, `final:*`, `pades:validate`, `sbom:check`, `release:dry-run`) are the substitute evidence set.
- Release provenance, signed tags and trusted publishing remain unmet spec requirements and are recorded in `docs/project-done-checklist.md` (criteria L/M) rather than silently claimed.

## Rationale

The project is developed by an owner-run, offline-capable workflow where a hosted runner is not guaranteed and adding a CI provider would create a second, less visible trust boundary for signing material, provenance and network access. Keeping gates local makes the same commands runnable in an air-gapped environment and keeps the evidence reproducible without a third-party service.

## Consequences

- Spec §21 "release provenance and signed-release processes operating in CI" and "fuzz/property/mutation tests in continuous integration" are **not met as written**; they are accepted as local/owner-run, and the unmet wording is recorded in `docs/project-done-checklist.md`.
- There is no automatic protection against a regression that a developer forgets to run locally. The Phase 12 `project:audit` check fails closed when evidence is absent to compensate.
- Restoring CI later requires a new ADR that also restores the corresponding release/provenance controls.
