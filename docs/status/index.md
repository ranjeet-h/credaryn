# Lifecycle status documentation

[Lifecycle status](lifecycle.md) is independent from immutable cryptographic validity. Status values are `ACTIVE`, `REVOKED`, `CANCELLED`, `SUPERSEDED`, `EXPIRED`, and `UNCHECKED`; freshness is separately `FRESH`, `STALE`, or `UNAVAILABLE`.

The status service is optional. Offline/unavailable status produces `UNCHECKED`/`UNAVAILABLE`, not a fabricated active or trusted result. TrustVC credentials use W3C Bitstring Status List v1.0 entries.
