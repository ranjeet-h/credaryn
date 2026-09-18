# ADR 0007: PKCS#11 validation is manual and opt-in, not CI

- Status: accepted
- Date: 2026-09-18
- Supersedes: the earlier requirements to test against SoftHSM2 in CI and to run scheduled real-provider smoke tests

## Decision

PKCS#11/HSM validation is **manual and opt-in**. The repository tests the PKCS#11 adapter against an injected provider double; SoftHSM2 and real HSM/vendor providers are exercised by documented manual smoke procedures, not by a repository test that claims hardware coverage.

Supporting detail:

- No SoftHSM2 binary, native PKCS#11 module or scheduled cloud job is part of the automated check set.
- `pnpm provider:smoke` and the per-provider checklists are the accepted evidence paths.
- Provider packages must not import native HSM runtimes; the caller supplies the client (see ADR 0006).

## Rationale

SoftHSM2 and vendor HSMs require platform-specific native modules, tokens, PINs and credentials that cannot be reproducibly provisioned in a repository-local check without either committing secrets or depending on a hosted runner (see ADR 0004). An injected double proves the adapter contract; only a live smoke test can prove real device behaviour, and claiming otherwise would be false assurance.

## Consequences

- The documented mock/reference level is covered; real-device verification remains pending.
- Real-provider and SoftHSM2 results are operator evidence and must be recorded before a production claim.
- Adding SoftHSM2 to automated gates requires a new ADR and a platform provisioning story.
