# Enterprise deployment

Enterprise deployments combine application SDKs, injected KMS/HSM clients, operator trust bundles or allow-listed `did:web`, verifier services, and optional PostgreSQL-backed lifecycle status. Kubernetes/Helm is not shipped without adoption evidence; use the container contracts in the Compose bundle as the reference.

## Required controls

- OIDC authorization and CSRF controls for administration; least-privilege roles and explicit CORS origins.
- Provider-managed key custody, versioned rotation, compromise drills, and no private-key export.
- TLS at ingress, non-root/read-only containers, bounded uploads, egress policy, health checks, patching, and secret-file injection.
- Structured, redacted audit events and correlation IDs exported to an operator SIEM; metrics/logs must not contain document bodies, credentials, or tokens.
- Operator-defined trust, retention, backup, deletion, incident-response, and status-freshness policy.

Reference evidence: `apps/admin/test/security.test.ts`, `packages/observability/`, [rotation](../key-management/rotation.md), [retention](../privacy/retention.md), and [incident response](../security/incident-response.md). Production acceptance remains an operator responsibility.
