# Air-gapped trust material

Place the operator-controlled **public** trust bundle here for the air-gapped
Compose override:

```bash
mkdir -p deploy/trust
cp /media/approved/air-gapped-trust-store.json deploy/trust/air-gapped-trust-store.json
```

The override at `deploy/docker-compose.air-gapped.yml` mounts
`deploy/trust/air-gapped-trust-store.json` read-only at
`/run/trust/trust-store.json` and points `CREDARYN_TRUST_STORE` at it. The
directory is git-ignored except for this file, so no trust material is
committed. It must contain public keys only — never private keys.

See [`docs/deployment/air-gapped.md`](../../docs/deployment/air-gapped.md).
