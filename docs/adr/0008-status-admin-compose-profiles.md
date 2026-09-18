# ADR 0008: Optional status/admin services ship in Compose behind profiles

- Status: accepted
- Date: 2026-09-18
- Supersedes: the earlier bundle without status/admin containers

## Decision

The self-hosted Compose bundle includes optional `status` and `admin` service containers plus the PostgreSQL `status-db`, all gated behind Compose **profiles** so the default `docker compose up` remains the minimal verifier + DSS pair. The DSS keystore password is supplied through a Docker secret file, and image references that Compose controls are digest-pinned.

Supporting detail:

- `deploy/docker-compose.yml` keeps `dss` and `verifier` as the default services. `status`, `status-db` and `admin` are only started with `--profile status` / `--profile admin`.
- `deploy/docker-compose.air-gapped.yml` is an override that mounts an operator-controlled local trust bundle and attaches the verifier/DSS to an internal network with no external egress.
- The status container runs `@credaryn/status` with a PostgreSQL-backed repository when `DATABASE_URL`/`PG*` is configured (in-memory only for local dev), and the admin container runs `@credaryn/admin` with real OIDC/JWKS verification when configured (fail-closed otherwise). The packages are implemented; live-infrastructure runs remain part of the manual checklist.

## Rationale

Optional status and admin components are part of the self-hosted surface, while the original bundle shipped only verifier + DSS + Postgres. Packaging them behind profiles satisfies that surface without making core cryptographic verification depend on an optional service. The default path stays small, and the optional services are backed by real implementations (PostgreSQL repository, OIDC/JWKS) while remaining non-essential for core verification.

## Consequences

- `docker compose -f deploy/docker-compose.yml config` must stay valid with and without the profiles; a Compose config test guards this.
- Operators enabling the status/admin profiles must supply the secret files under `deploy/secrets/` (git-ignored) and are responsible for validating the reference services before production use.
- If the status/admin services later gain full durable/HTTP implementations, the container definitions in this ADR can stay unchanged; only the documented support level changes.
