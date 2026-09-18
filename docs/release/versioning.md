# Release and versioning policy

Credaryn uses semantic versioning for publishable package APIs:

- **MAJOR:** incompatible public API, protocol, or trust-semantics change;
- **MINOR:** backward-compatible capability or adapter addition;
- **PATCH:** backward-compatible bug, security, documentation, or fixture fix.

Every publishable package behavior change gets a Changeset. Security fixes
must describe affected boundaries, whether existing artifacts remain valid,
and the recommended upgrade or key-rotation action.

The current workspace is private and still pre-1.0. A local release dry run
creates an ephemeral signed candidate manifest without publishing or persisting
the private signing key:

```bash
pnpm release:dry-run
```

This does not prove Git tag signing, npm provenance, OIDC publishing, or a
third-party security review. Those remain explicit release gates.
