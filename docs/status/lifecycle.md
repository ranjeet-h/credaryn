# Lifecycle status service

Lifecycle status is an operational projection, not a replacement for a
signature. The optional status service records append-only transitions for
`ACTIVE`, `REVOKED`, `CANCELLED`, `SUPERSEDED`, and `EXPIRED` key/document
references.

If the service is unavailable, the verifier keeps historical cryptographic
validity and reports lifecycle `UNCHECKED` with freshness `UNAVAILABLE`. A
freshness-required policy similarly reports `UNCHECKED` for stale status rather
than invalidating the signature.

The in-memory `StatusService` is the reference contract. PostgreSQL persistence
uses `services/status/src/schema.sql`; it must preserve the append-only history
and current projection semantics.
