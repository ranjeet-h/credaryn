# Milestone 12 verification report

Date: 2026-09-18

Status: **BLOCKED — owner/manual acceptance not yet performed; implementation backlog remains**

Owner acceptance: PENDING
Self-host result: PENDING
Air-gap result: PENDING

## Automated checks

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` (Node 24.13.1, pnpm 12.3.3) | PASS |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` with DSS fixture service | PASS; 51 files, 168 tests |
| `pnpm test:property` | PASS; 1 file, 2 tests |
| `pnpm test:fuzz` | PASS; 3 files, 3 tests |
| `pnpm test:mutation` with DSS fixture service | PASS; 4 files, 9 tests |
| `pnpm docs:check` | PASS; 1 file, 2 tests |
| `pnpm vectors:reproduce` | PASS; `VALID_TRUSTED`, 139-byte payload, 229-byte COSE |
| `pnpm interop:vectors:check` | PASS; 1 file, 4 tests |
| `pnpm adapter:fixtures:check` | PASS; 1 file, 2 tests |
| `pnpm bundle:inspect` | PASS |
| `pnpm compatibility:report` | PASS; Node 24.13.1, manual-only browser verification |
| `pnpm sbom:check` | PASS; 281 components |
| `pnpm release:dry-run` | PASS; no persisted private key |
| `pnpm audit --audit-level moderate` | PASS; no known vulnerabilities |
| `pnpm format:check` | PASS |
| Focused trust/signature regression tests | PASS; 8 files, 38 tests |
| `tsx scripts/project-audit.ts --report` | REPORT; all 14 evidence-path sets present, seven owner/manual gates pending |
| `tsx scripts/final-user-journeys.ts --report` | REPORT; prerequisite hashes emitted, manual acceptance pending |
| `tsx scripts/final-self-host-check.ts --report` | REPORT; Compose config valid, live deployment not started |
| `tsx scripts/final-air-gap-check.ts --report` | REPORT; local prerequisites/status evidence present, network-isolated run not performed |
| Ruby Psych parse of `openapi/v1.yaml` | PASS; OpenAPI 3.1 document with five paths |
| `pnpm project:audit` | EXPECTED BLOCK; exit 1 for pending owner gates |
| `pnpm final:user-journeys` | EXPECTED BLOCK; exit 1 for pending owner acceptance |
| `pnpm final:self-host-check` | EXPECTED BLOCK; exit 1 without operator-started deployment URL |
| `pnpm final:air-gap-check` | EXPECTED BLOCK; exit 1 without genuine isolated-network confirmation |
| `git diff --check` | PASS |

The checks above used the repository-declared `pnpm` directly under Node
24.13.1. DSS was started only for the commands that require it and was removed
with an `EXIT` trap; port 8080 was confirmed free afterward. The trust boundary
now fails closed for resolve-only stores, the Phase 0 spike applies explicit
trust decisions, and COSE creation accepts provider-native 64-byte signatures.
No browser automation was used.

## A–N evidence

See [project completion checklist](../project-done-checklist.md). Criteria B, C, H, I, J, L, and M retain explicit owner/operator gates. D, E, and F also remain partial at the implementation level; see the checklist and `CODING-TODO.md`. K is an owner-approved deferral and no OCR implementation is claimed.

## Manual journeys

Issuer, PDF recipient, paper recipient, tamper, enterprise administration, self-host, air-gap, security-auditor, and physical compatibility-corpus observations are **NOT RUN** for this report. Follow the execution plan and deployment guides. Record exact environment, command/page, actions, expected and observed results, artifact hashes, device models, and limitations here.

## Security and scope

No GitHub Actions, browser automation, OCR, hosted-service requirement, blockchain, central CA, or watermark dependency was added by Phase 12. Existing modified/untracked user files were not treated as audit evidence. Release provenance and final owner review remain external gates.

## STOP decision

Do not declare the project complete, tag, commit, or publish. Request owner verification after all check-mode commands and manual journeys have genuine evidence. Replace `PENDING` with `ACCEPTED` only after that review.
