# ADR 0007: PKCS#11 validation is manual and opt-in, not CI

- Status: accepted for Phase 12
- Date: 2026-09-18
- Supersedes: spec §19 "tested against SoftHSM2 in CI" and "scheduled real-provider smoke tests"

## Decision

PKCS#11/HSM validation is **manual and opt-in**. The repository tests the PKCS#11 adapter against an injected provider double; SoftHSM2 and real HSM/vendor providers are exercised by owner-run smoke procedures documented under `docs/verification/milestone-7-pkcs11.md`, not by a repository test that claims hardware coverage.

Supporting detail:

- No SoftHSM2 binary, native PKCS#11 module or scheduled cloud job is part of the automated gate set.
- `pnpm provider:smoke` and the per-provider checklists under `docs/verification/` are the accepted evidence paths.
- Provider packages must not import native HSM runtimes; the caller supplies the client (see ADR 0006).

## Rationale

SoftHSM2 and vendor HSMs require platform-specific native modules, tokens, PINs and credentials that cannot be reproducibly provisioned in a repository-local gate without either committing secrets or depending on a hosted runner (see ADR 0004). An injected double proves the adapter contract; only an owner-run smoke test can prove real device behaviour, and claiming otherwise would be false assurance.

## Consequences

- Spec Criterion E ("paths are documented and tested to their promised support level") is met at the documented mock/reference level with real-device acceptance still pending; this is recorded in `docs/project-done-checklist.md`.
- Real-provider and SoftHSM2 results are operator evidence and must be recorded before a production claim.
- Adding SoftHSM2 to automated gates requires a new ADR and a platform provisioning story.
