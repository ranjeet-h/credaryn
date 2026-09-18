# Self-hosted verifier deployment

The Compose bundle runs the verifier API/UI and the DSS reference engine
without a Credaryn-hosted dependency. Optional status and admin components are
gated behind Compose profiles so the default deployment stays minimal.

## Prepare secrets

Secrets are read from files under `deploy/secrets/` (git-ignored); the Compose
bundle never sets the DSS keystore password inline. Create both files before the
first start:

```bash
mkdir -p deploy/secrets
printf '%s' "$(openssl rand -base64 24)" > deploy/secrets/dss_keystore_password
printf '%s' "$(openssl rand -base64 24)" > deploy/secrets/postgres_password
chmod 600 deploy/secrets/dss_keystore_password deploy/secrets/postgres_password
```

The DSS entrypoint is wrapped by `deploy/dss-entrypoint-secret.sh`, which reads
`/run/secrets/dss_keystore_password` and exports `DSS_KEYSTORE_PASSWORD` before
starting the adapter. The status profile uses the same pattern via
`deploy/status-entrypoint-secret.sh`, which reads `/run/secrets/postgres_password`
and exports `DATABASE_URL`. `deploy/secrets/` is git-ignored, so secret material
never enters the repository.

## Default bundle (verifier + DSS)

```bash
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

## Optional status and admin profiles

The status profile starts the real status server (`services/status/src/server.ts`)
against PostgreSQL. The wrapper `deploy/status-entrypoint-secret.sh` reads
`/run/secrets/postgres_password` and exports a `DATABASE_URL` for
`status-db:5432`, so the password is supplied as a Docker secret rather than an
inline environment value. When `DATABASE_URL` (or the standard `PG*` variables)
is absent the server falls back to the in-memory repository, which is only
appropriate for local development. Status writes stay disabled until
`STATUS_ADMIN_TOKEN` is set.

The admin profile runs the admin app's launcher (`apps/admin/src/main.ts`). It uses real
OIDC/JWKS verification when `CREDARYN_OIDC_ISSUER` + `CREDARYN_OIDC_JWKS_URI` are set, and fails
closed (501) otherwise. Its lifecycle-status store is in-memory in the reference launcher; wire
`@credaryn/status` or your own repository for durable administration.

```bash
# Status server + PostgreSQL (durable, append-only history).
STATUS_ADMIN_TOKEN="$(openssl rand -hex 24)" \
  docker compose -f deploy/docker-compose.yml --profile status up -d

# Admin reference surface
docker compose -f deploy/docker-compose.yml --profile admin up -d
```

To let the verifier consume lifecycle status, point it at the status service in
the same Compose network. The internal hop is plain HTTP, so enable the explicit
opt-in (never use this across an untrusted network):

```bash
STATUS_ADMIN_TOKEN="$(openssl rand -hex 24)" \
CREDARYN_STATUS_URL="http://status:4174/v1/status" \
CREDARYN_STATUS_ALLOW_INSECURE=true \
  docker compose -f deploy/docker-compose.yml --profile status up -d
```

Outside Compose, `CREDARYN_STATUS_URL` must be HTTPS. The verifier only queries
the configured service and never follows a document-supplied status URL, and a
missing/`UNAVAILABLE` lookup leaves the lifecycle field `UNCHECKED` without
changing cryptographic validity or trust.

The status service must not be used to replace cryptographic verification. If
it is unavailable or stale, historical cryptographic validity remains separate
and the normalized lifecycle field is `UNCHECKED` / `UNAVAILABLE`.

## Air-gapped profile

The air-gapped override loads only an operator-controlled local public trust
bundle and attaches the DSS signing service to an internal network with no
external route:

```bash
# Provide a local public trust bundle first (no private keys).
mkdir -p deploy/trust
cp /media/approved/air-gapped-trust-store.json deploy/trust/air-gapped-trust-store.json

docker compose -f deploy/docker-compose.yml \
  -f deploy/docker-compose.air-gapped.yml up -d
```

The verifier UI binds to host loopback only and status/admin profiles must not
be enabled. Compose cannot remove the host route for a published port, so the
operator must additionally block egress at the host/network layer. See
[`docs/deployment/air-gapped.md`](../docs/deployment/air-gapped.md) and run
`pnpm final:air-gap-check -- --report`.

## Base-image digests

All base images are digest-pinned: the PostgreSQL image in `docker-compose.yml`, and the
`FROM` references in `apps/verifier-web/Dockerfile` (Node 24 slim) and
`adapters/pades-dss/Dockerfile` (Maven/Temurin build stage and Temurin runtime). Pin updates by
refreshing the digest from the upstream tag, e.g. `docker buildx imagetools inspect node:24-bookworm-slim`.

## Validate without starting

```bash
docker compose -f deploy/docker-compose.yml config --quiet
docker compose -f deploy/docker-compose.yml --profile status --profile admin config --quiet
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.air-gapped.yml config --quiet
```
