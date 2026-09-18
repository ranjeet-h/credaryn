# ADR 0006: Hand-rolled provider clients instead of official cloud SDKs

- Status: accepted
- Date: 2026-09-18
- Supersedes: the earlier requirement to use the official AWS/Google/Azure SDKs

## Decision

AWS KMS, Google Cloud KMS and Azure Key Vault adapters are implemented against **injected, hand-rolled client interfaces** rather than importing the official vendor SDKs. Provider packages must not import `@aws-sdk/*`, `@google-cloud/*` or `@azure/*`; this is enforced by `scripts/check-boundaries.mjs`.

Supporting detail:

- The host application constructs and injects a minimal client (sign, get-public-key, describe-key, health); the adapter normalises vendor failures and returns only public material.
- Signature-format normalisation (for example AWS DER to COSE `r||s`) is the adapter's responsibility and is unit-tested with golden vectors.
- Only `@credaryn/core` contracts cross the adapter boundary.

## Rationale

Importing three large vendor SDKs would add heavyweight transitive dependencies, credential-chain assumptions, network/telemetry defaults and native modules to a repository whose core promise is a small, auditable, air-gappable trust boundary. Injected clients keep the adapter testable without a live account, keep credentials in the caller, and avoid a vendor SDK becoming the de-facto protocol definition.

## Consequences

- The official SDKs are not imported; parity with real provider behaviour must be proven by live smoke tests (`pnpm provider:smoke`), documented per provider.
- Adapter authors carry more normalisation code (for example DER/COSE conversion) and must keep golden vectors current.
- A future decision to adopt official SDKs must preserve the injected-client seam and add the dependency deliberately.
