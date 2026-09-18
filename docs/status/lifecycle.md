# Lifecycle status service

Lifecycle status is an operational projection, not a replacement for a
signature. The optional status service records append-only transitions for
`ACTIVE`, `REVOKED`, `CANCELLED`, `SUPERSEDED`, and `EXPIRED` key/document
references.

If the service is unavailable, the verifier keeps historical cryptographic
validity and reports lifecycle `UNCHECKED` with freshness `UNAVAILABLE`. A
freshness-required policy similarly reports `UNCHECKED` for stale status rather
than invalidating the signature.

The reference status service uses a document-scoped `StatusRepository`. The
default in-memory repository is the reference contract; `PostgresStatusRepository`
accepts an injected query executor and uses `services/status/src/schema.sql`,
which must preserve append-only history and the current projection semantics
(UPDATE/DELETE are rejected by a trigger). `createHttpStatusResolver` provides a
bounded HTTPS resolver for verifier consumption; when no reference is available
or the service is unreachable, lifecycle stays `UNCHECKED`.
