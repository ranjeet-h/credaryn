# Final interoperability vectors

| Vector | Path | Automated check | Status |
| --- | --- | --- | --- |
| Paper Seal Profile v1 | `test-vectors/paper-v1/` | `pnpm vectors:reproduce` | Published |
| PAdES original/mutation | `test-vectors/pdf/` | `pnpm pades:validate --validator independent` | Published; external validator required |
| W3C VC 2.0 / did:web / ECDSA-SD-2023 | `test-vectors/w3c/did-web/` | `pnpm interop:vectors:check` | Partial: did:web fixture is published; dedicated ECDSA-SD-2023 and Bitstring Status List vector directories remain open |
| ES256 DER conversion | `test-vectors/providers/es256/` | provider tests | Published |

Vectors contain public data only. A passing fixture proves compatibility with its stated profile, not issuer trust or legal signature status.
