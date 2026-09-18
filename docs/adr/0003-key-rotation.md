# ADR 0003: immutable versioned key identity and overlap rotation

- Status: accepted
- Date: 2026-09-17

## Decision

Credaryn identifies every signing key by the tuple `issuerId`, provider key ID, provider version, and certificate fingerprint. The Paper Seal key ID is the stable provider key ID plus version (`issuer-key@v1`). Rotation authorizes and publishes a new version before activation. The active version signs new documents; retired versions remain resolvable for historical verification.

Cloud SDKs and PKCS#11 types stay behind injected client interfaces in provider packages. Core imports only normalized signer, key metadata, health, and error contracts.

## Rationale

Provider version IDs and public fingerprints make an old document explainable after rotation and prevent a provider alias from silently pointing at different public material. Overlap prevents a verifier from seeing a new key ID before its public key is available. Keeping credentials and SDK clients in the host application avoids making core depend on one cloud, credential chain, or native HSM runtime.

## Consequences

- Operators must publish trust metadata before activation and retain historical public records.
- Provider adapters must normalize vendor failures and never return private material.
- Production deployments need durable storage around the registry semantics; the package registry is intentionally not a distributed store.
- Real-provider validation requires a live test account or HSM and is a manual verification step, not a repository test fixture.
