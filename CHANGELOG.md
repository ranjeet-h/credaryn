# Changelog

All notable changes to Credaryn are documented here. This project uses
[Changesets](https://github.com/changesets/changesets) to manage versions and
changelog entries.

Add a changeset for every publishable behavior change:

```bash
pnpm changeset
```

## Unreleased

- Security hardening for bounded verifier input and artifact-integrity
  boundaries (`@credaryn/paper`, `@credaryn/pdf`, `@credaryn/verifier`).
- Added the air-gapped Compose profile, optional status/admin containers,
  digest-pinned PostgreSQL image and Docker-secret keystore password.
- Added workspace-wide trust-boundary enforcement, signed-artifact mutation
  regression, PAdES validation gate, coverage thresholds and release-verification
  scripts.
