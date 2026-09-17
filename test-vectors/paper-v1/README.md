# Paper Seal Profile v1 golden vectors

These files are reproducible Milestone 2 vectors for the fixed descriptor in
`descriptor.json`. The fixture signer contains only a public key and a fixed
known-answer signature; no private key is stored in this repository.

| Field | Value |
| --- | --- |
| Profile version | `1` |
| Transport prefix | `CRD1:` |
| Carrier | QR Code, error correction `M` |
| Signed container | COSE_Sign1 |
| Signature algorithm | ES256 / P-256 / SHA-256 |
| Key ID | `phase-2-vector` |
| Maximum COSE object | `1200` bytes before Base45 |
| Payload bytes | `139` |
| COSE bytes | `229` |
| Payload SHA-256 | `41ba983eefdf15c4c654e8cffd9568a3f42877a097d4bf7a6fdfdb850fa8bf74` |
| COSE SHA-256 | `6abcfdbe6f9327e64da8966832d7335f6eade4ef532a38c14ca84cd7e2f401b6` |
| Transport SHA-256 | `4c574f78649d64b6351e94a0e41c14bae29d0345a693cda26aa5acef93145167` |
| QR PNG SHA-256 | `8e6627b9f93c4eff1221a05eade166fdf061356486bed069be92f5dedbba9c18` |

The numeric payload field map is:

| Key | Field | Encoding |
| ---: | --- | --- |
| `1` | version | unsigned integer `1` |
| `2` | issuerId | text |
| `3` | keyId | text |
| `4` | documentId | text |
| `5` | documentType | text |
| `6` | issuedAt | RFC 3339 text |
| `7` | claims | flat CBOR map |
| `8` | statusUrl | optional text |
| `9` | artifactDigest | optional text |

Run the reproducible vector check from the repository root:

```bash
pnpm --filter @credaryn/paper vectors:check
```

Regenerate the binary files only when intentionally updating the fixture:

```bash
pnpm --filter @credaryn/paper vectors:generate
```

The vector is standards-oriented and ISO 22376 VDS-informed, but it does not
claim ISO 22376 conformance. Trust is supplied by the verifier; the QR does
not embed a global Credaryn trust claim.
