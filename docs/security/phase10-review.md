# Phase 10 independent security review

Date: 2026-09-18

Reviewer: independent GPT-5.6 Luna review subagent

## Scope

- TrustVC ECDSA-SD-2023 issuance, selective disclosure, and verification;
- base-versus-derived proof classification and fail-closed tamper handling;
- removal of the legacy `@trustvc/w3c-vc` BBS compatibility dependency;
- dependency tree and moderate-severity audit result;
- regression coverage and runtime/type compatibility.

## Findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| Critical | None | — |
| Important | Dependency-audit documentation described the removed vulnerable subtree as still installed | Fixed in `docs/security/dependency-audit.md` |
| Minor | Derived/tampered/missing-proof regression coverage was incomplete | Added focused interoperability assertions |
| Minor | Credential proof typing did not represent valid proof arrays | `CredentialProof` is exported and `W3cCredential.proof` accepts one or more proofs |
| Minor | Base-proof detection was version-coupled | Replaced the broad prefix heuristic with the ECDSA-SD CBOR base marker and fail-closed error handling |

## Evidence

- `pnpm --filter @credaryn/standards-trustvc test`: 4 tests passed;
- `pnpm typecheck`: passed;
- `pnpm audit --audit-level moderate`: no known vulnerabilities;
- `pnpm test`: 51 files and 156 tests passed;
- tampered base and derived credentials, and missing proofs, return `INVALID`;
- no legacy `@trustvc/w3c-vc`, `request`, `tough-cookie`, vulnerable `qs`, or
  old UUID dependency remains in the lockfile.

This is an independent repository review, not a third-party penetration test
or legal certification.
