# Signed claims versus artifact integrity

Credaryn keeps two questions separate:

| Question | Evidence | Demo result |
| --- | --- | --- |
| What claims did the issuer sign? | CRD1 Paper Seal, verified with ES256 | INR 11,800.00 |
| Are these PDF bytes the signed artifact? | PAdES Baseline B-B validation | `VALID` before the change, `INVALID` after it |

The Paper Seal uses `PAPER_CLAIMS_ONLY`. It does not prove that a scanned,
printed or re-rendered PDF is byte-for-byte the original artifact. The PDF
signature uses `DIGITAL_ARTIFACT_SIGNED`; it does not replace the signed claims
or make the visible document impossible to edit.

The demo therefore reports `VALID_TRUSTED`, `VALID_UNTRUSTED`, `INVALID` and
`UNVERIFIABLE` separately from artifact integrity, lifecycle status and
security mode. A development trust store is explicitly labeled as such and
must not be treated as a production root of trust.
