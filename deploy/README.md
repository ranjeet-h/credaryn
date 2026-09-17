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
