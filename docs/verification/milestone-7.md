# Milestone 7 verification report

Date: 2026-09-17

## Automated checks

All checks were run on branch `master` with Node `v24.13.1` and pnpm
`12.3.3`. No GitHub Actions workflow, browser automation, or UI automation
was added or used.

| Check | Result |
| --- | --- |
| `pnpm lint` | PASS; core boundary check passed for 9 TypeScript files |
| `pnpm typecheck` | PASS |
| `pnpm vitest packages/core/test/key-lifecycle.test.ts providers/*/test --run` | PASS; 7 files, 23 tests |
| `pnpm vitest providers/shared/test/shared-vectors.test.ts --run` | PASS; 1 file, 2 tests |
| `pnpm test` | PASS; 36 files, 125 tests |
| `pnpm --filter @credaryn/pkcs11 test:softhsm` | PASS; injected-client contract fixture, 1 file, 3 tests |
| Four `pnpm provider:smoke --provider ... --mock` commands | PASS; AWS, GCP, Azure and PKCS#11 |
| Four provider example `issue` commands | PASS; equivalent `CRD1:` transport, versioned key and `HEALTHY` output |
| `pnpm key-rotation:demo` | PASS; `AUTHORIZED` → active `v2`, historical `v1` is `RETIRED` |
| `docker compose ... config` | PASS; SoftHSM2 Compose file parses |
| `pnpm docs:check` | PASS; 1 file, 2 tests |
| `pnpm bundle:inspect` | PASS |
| `pnpm format:check` | PASS |

The repository intentionally uses injected client interfaces rather than
installing AWS/GCP/Azure SDKs or a native PKCS#11 module. No cloud credentials,
private key bytes, HSM PINs, or service-account files were used.

## Manual provider checkpoint — pending owner verification

The following production-account and SoftHSM checks remain owner-run. They are
not represented as automated CI and must not be inferred from the mock results:

Sub-reports: [AWS](milestone-7-aws.md), [Google Cloud](milestone-7-gcp.md),
[Azure](milestone-7-azure.md), [PKCS#11](milestone-7-pkcs11.md), and
[rotation](milestone-7-rotation.md).

1. Inject an official AWS KMS client for an owner-controlled `ECC_NIST_P256`
   test key. Issue and verify a Paper Seal, record the immutable provider key
   version, and confirm no private bytes are returned.
2. Repeat with Google Cloud KMS `EC_SIGN_P256_SHA256`.
3. Repeat with Azure Key Vault or Managed HSM P-256.
4. Start `docker compose -f providers/pkcs11/docker-compose.soft-hsm.yml up -d`
   and run the owner-controlled PKCS#11 client against the SoftHSM token. The
   repository adapter test uses an injected test client and does not claim this
   native-module check passed.
5. Review `pnpm key-rotation:demo` output and the lifecycle docs for authorize,
   publish, activate, retire, revoke, and compromise behavior.

Record provider name, key version, public fingerprint, health result, and any
limitations here before closing the milestone:

```text
Manual status: PENDING
AWS: pending
Google Cloud: pending
Azure: pending
PKCS#11/SoftHSM: pending
Rotation review: automated demo passed; owner review pending
```

## STOP decision

Automated implementation gates pass. Milestone 7 is intentionally stopped here
until the owner completes the real-provider/SoftHSM checkpoint and explicitly
releases Milestone 8. No GitHub Actions CI workflow was added.
