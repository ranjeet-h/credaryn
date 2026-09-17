# Trust policy: local keys, X.509 anchors, and did:web

The verifier distinguishes cryptographic validity from issuer trust. A
signature can be mathematically valid while its issuer is `UNTRUSTED` or
`UNVERIFIABLE`.

`TrustPolicy` supports three explicit trust sources:

1. configured public keys for offline/self-hosted verification;
2. configured certificate fingerprints representing enterprise X.509 anchors;
3. an opt-in `did:web` resolver restricted to HTTPS and an allow-listed domain.

Resolver output alone is never trusted. A fetched key must come from the
allowed `did:web` source or match an explicit X.509 anchor, and cache age may be
required to be fresh. Resolver failure returns unavailable/untrusted evidence;
it never upgrades a result.
