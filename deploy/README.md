# Self-hosted verifier deployment

The Compose bundle runs the verifier API/UI and the DSS reference engine
without a Credaryn-hosted dependency. The status database is optional and is
enabled only with the `status` profile.

```bash
mkdir -p deploy/secrets
printf '%s' 'replace-with-an-operator-secret' > deploy/secrets/postgres_password
docker compose -f deploy/docker-compose.yml up -d
curl -fsS http://localhost:8080/v1/health
curl -fsS http://localhost:8080/v1/version
```

If another local service already uses port 8080, choose a different host port
without changing the container port:

```bash
CREDARYN_VERIFIER_PORT=8081 docker compose -f deploy/docker-compose.yml up -d
curl -fsS http://localhost:8081/v1/health
```

The default deployment intentionally has no trust material, so a valid
signature is reported as `UNVERIFIABLE` rather than trusted. To manually test
the browser with the development Paper Seal trust bundle, generate the local
demo bundle first and start the opt-in override:

```bash
pnpm --filter @credaryn/paper demo:encode
CREDARYN_VERIFIER_PORT=8081 \
docker compose -f deploy/docker-compose.yml \
  -f deploy/docker-compose.demo-trust.yml up -d
```

Use `artifacts/paper/invoice-11800.png` or its CRD1 text in the browser. The
expected result is `VALID_TRUSTED`, `PAPER_CLAIMS_ONLY`, and populated signed
claims. This bundle is development-only and does not match the DSS PDF key.
For a trusted PDF test, provide an operator-managed bundle containing the DSS
certificate's public key and set `CREDARYN_TRUST_BUNDLE` to that JSON file.

When finished reviewing, stop the verifier and DSS containers so their ports
are released:

```bash
docker compose -f deploy/docker-compose.yml down
```

The verifier container is non-root, read-only except for `/tmp`, and has a
healthcheck. Uploaded documents are processed in memory and are not persisted
by the verifier. Do not put cloud credentials or signing key material in this
repository or Compose environment values; production signing stays behind the
injected signer boundary.

Enable optional status persistence only when it is needed:

```bash
docker compose -f deploy/docker-compose.yml --profile status up -d
```

The status service must not be used to replace cryptographic verification. If
it is unavailable or stale, historical cryptographic validity remains separate
and the normalized lifecycle field is `UNCHECKED`.
