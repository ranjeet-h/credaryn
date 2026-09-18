# Air-gapped verification

Air-gapped mode verifies PDF or Paper Seal cryptographic evidence with local, operator-controlled public trust material. It does not fetch `did:web`, status, TSA, or hosted Credaryn services. Online lifecycle state must be shown as `UNCHECKED` with freshness `UNAVAILABLE` (or `STALE` for an expired local snapshot).

1. On a connected staging system, obtain and authenticate container images, binaries, public trust bundles, test vectors, and checksums. Never export private signing keys for verification.
2. Transfer them through the organization's approved media process and verify checksums/signatures inside the isolated environment.
3. Configure only local trust paths and local DSS/verifier endpoints. Block DNS and network egress at the host/network layer.
4. Reproduce the Paper vector, verify the original and mutated PDF, and inspect lifecycle freshness.
5. Record host, versions, trust-bundle digest, commands, results, and network-isolation method in `docs/verification/milestone-12.md`.

Run `pnpm final:air-gap-check -- --report` before the exercise. A check-mode success additionally requires the operator to perform the isolation and explicitly record confirmation; the script cannot prove host network isolation itself.

## Reference bundle

The `deploy/docker-compose.air-gapped.yml` override implements this profile:

```bash
mkdir -p deploy/trust
cp /media/approved/air-gapped-trust-store.json deploy/trust/air-gapped-trust-store.json
docker compose -f deploy/docker-compose.yml \
  -f deploy/docker-compose.air-gapped.yml up -d
```

It sets `CREDARYN_TRUST_STORE` to the local public bundle, binds the verifier to
host loopback, and attaches the DSS signing service only to an internal Docker
network (`internal: true`) with no external route. Status/admin profiles must
not be enabled, so online lifecycle is `UNCHECKED` / `UNAVAILABLE`. Compose
cannot remove the host route for a published port, so complete egress blocking
remains a host/network responsibility and is recorded as an operator
observation in `docs/verification/milestone-12.md`.
