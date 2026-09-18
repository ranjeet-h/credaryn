# Docker Compose deployment

The maintained standard bundle is described in [`deploy/README.md`](../../deploy/README.md) and defined by `deploy/docker-compose.yml`. It runs the verifier and DSS adapter; PostgreSQL status persistence is an optional profile. It has no Credaryn SaaS dependency.

Validate configuration with `docker compose -f deploy/docker-compose.yml config --quiet`, start it per the deployment README, then run `CREDARYN_SELF_HOST_BASE_URL=http://localhost:8080 pnpm final:self-host-check`. This check does not substitute for operator-observed PDF/paper verification. Secrets belong in operator-managed files or stores and must not be committed.
