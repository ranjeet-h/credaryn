# Milestone 7 PKCS#11 / SoftHSM2 sub-report

Status: PENDING owner-run native-module checkpoint.

Automated injected-client contract: PASS. The adapter keeps PKCS#11 types
outside core and reports an immutable versioned key ID without private bytes.

Owner checkpoint: run
`docker compose -f providers/pkcs11/docker-compose.soft-hsm.yml up -d`, use
an owner-controlled PKCS#11 client against the token, issue and verify a Paper
Seal, and record the slot/key identity, public fingerprint, health result, and
limitations. The repository fixture does not claim this native-module check.

```text
Slot/key identity: pending
Public fingerprint: pending
Health: pending
Observed result: pending
```
