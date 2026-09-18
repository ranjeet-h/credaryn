# Milestone 10 security-hardening checkpoint

Date: 2026-09-18

Branch: `master`

Status: **BLOCKED before stable-1.0 completion**

This checkpoint implements and verifies the local hardening work. It does not
claim completion of the external independent-validator, security-review,
provenance, or moderate-dependency-audit gates.

## Implemented local controls

- Added `SECURITY.md`, private-reporting guidance, incident response, threat
  model, assumptions, legal wording, compatibility, benchmark, release, and
  SBOM documentation.
- Added bounded fuzz tests for Paper Seal and unified verifier input paths.
- Added COSE identity/claims mutation tests and post-signing PDF mutation tests.
- Added PNG IHDR dimension validation before `pngjs` decompression to reject
  oversized declared dimensions early.
- Added bounded `test:fuzz`, `test:mutation`, compatibility, benchmark, SBOM,
  PAdES, vector-reproduction, and release dry-run commands.
- Added dependency overrides for patched transitive high-severity packages and
  upgraded Puppeteer examples to `25.11.0`.
- Added an ephemeral signed release-candidate manifest. The private key is
  generated in memory and is never written.

## Automated results

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; lockfile accepted; upstream transitive deprecation/native-install warnings remain |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test:all` with DSS healthy | PASS; 51 files, 156 tests |
| `pnpm test:property` / bounded fuzz tests | PASS |
| `pnpm test:fuzz -- --time-limit=120` | PASS; 3 files, 3 tests |
| `pnpm test:mutation -- --changed-only` | PASS; 3 files, 6 tests |
| `pnpm vectors:reproduce` | PASS; golden Paper Seal vector trusted |
| `pnpm pades:validate --validator dss` | PASS; original PDF valid, mutation invalid |
| `pnpm compatibility:report` | PASS; Node `v24.13.1`, pnpm `12.3.3` |
| `pnpm benchmark` | PASS; 50 bounded iterations; report documented |
| `pnpm sbom:check` | PASS; CycloneDX report with 453 external components |
| `pnpm release:dry-run` | PASS; ephemeral signed candidate, no private key persisted |
| `pnpm audit --audit-level high` | PASS after overrides and Puppeteer upgrade |
| `pnpm audit --audit-level moderate` | BLOCKED; five moderate TrustVC transitive findings remain |
| `pnpm pades:validate --validator independent` | BLOCKED; `pdfsig` is not installed |

## Manual/external gates still required

1. Install or provide an independent compatible PAdES validator and compare a
   signed and mutated fixture against DSS.
2. Remove, upgrade upstream, or explicitly risk-accept the five moderate
   vulnerabilities in TrustVC's legacy BBS compatibility dependency.
3. Complete an independent security review and record every material finding,
   fix, or owner-approved risk acceptance.
4. Configure and verify GitHub private vulnerability reporting before beta.
5. Run a real clean-install release-candidate review, signed-tag/provenance
   check, and OIDC/npm publishing dry run without long-lived credentials.

The full audit disposition is recorded in
`docs/security/dependency-audit.md`. OCR remains explicitly out of scope and
is only an integrating application's optional usability layer.

## Cleanup

The DSS-backed test run used a teardown trap and was followed by an explicit
port check. Port `8080` was free after verification.

## STOP decision

Stop Milestone 10 here. Do not claim stable 1.0 or begin Milestone 11/12 until
the blockers above are resolved or explicitly risk-accepted by the owner.
