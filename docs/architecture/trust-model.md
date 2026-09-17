# Phase 1 trust model

Credaryn keeps three facts separate:

1. **Cryptographic validity:** whether the supplied signature or artifact proof verifies.
2. **Issuer trust:** whether the matching issuer/key is present in the caller's `TrustStore`.
3. **Lifecycle:** whether an independently supplied status is `ACTIVE`, `REVOKED`, `CANCELLED`, `SUPERSEDED`, `EXPIRED` or `UNCHECKED`.

The resulting verdicts are:

| Cryptographic evidence | Trust decision | Verdict |
| --- | --- | --- |
| invalid | any | `INVALID` |
| unavailable | any | `UNVERIFIABLE` |
| valid | trusted key | `VALID_TRUSTED` |
| valid | known but untrusted key | `VALID_UNTRUSTED` |
| valid | missing trust material | `UNVERIFIABLE` |

The local provider in `providers/local` generates an ephemeral P-256 key for development. `LocalSigner.isDevelopmentOnly` and `DemoTrustStore.isDevelopmentOnly` are always true, and the public metadata contains no private-key bytes. This material is not a production trust anchor.
