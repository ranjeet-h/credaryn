# Paper Seal Profile v1

Credaryn V1 carries signed business-critical claims onto paper as a QR Code.
The profile uses standard primitives and transport formats; it is not a new
cryptographic algorithm and does not claim ISO 22376 conformance.

## Encoding pipeline

```text
DocumentDescriptor
  -> validate required fields and flat claims
  -> numeric-field deterministic CBOR payload
  -> COSE_Sign1 protected ES256 + key ID
  -> size check: <= 1200 bytes
  -> RFC 9285 Base45
  -> CRD1:<Base45>
  -> QR Code with error correction M
```

The source PDF, full document, notes and unnecessary PII are never copied into
the payload. Only the normalized descriptor fields listed below are included.

## Payload field map

The top-level CBOR map uses compact integer keys so the QR remains predictable:

| Key | Field | Required | Type |
| ---: | --- | --- | --- |
| `1` | version | yes | unsigned integer `1` |
| `2` | issuerId | yes | non-empty text |
| `3` | keyId | yes | non-empty text |
| `4` | documentId | yes | non-empty text |
| `5` | documentType | yes | non-empty text |
| `6` | issuedAt | yes | RFC 3339 text |
| `7` | claims | yes | flat map of text/boolean/safe integer values |
| `8` | statusUrl | no | HTTPS text when present |
| `9` | artifactDigest | no | compact application-supplied text |
| `10` | certificateFingerprint | no | signer certificate/public-key fingerprint bound to the trusted key |

Claim keys are sorted using RFC 8949 core-deterministic map ordering: by the
bytewise lexicographic order of each key's encoded bytes. Equivalent JavaScript
objects therefore produce byte-identical payloads regardless of insertion
order. Unsupported floats, unsafe integers, arrays, nested objects, binary
values, empty keys and surrounding whitespace fail closed.

## COSE and trust

The signed object is a four-item COSE_Sign1 array:

```text
[ protected : bstr, unprotected : {}, payload : bstr, signature : bstr ]
```

Protected header label `1` is `-7` (ES256), and label `4` carries the UTF-8
key ID. The signature is the fixed-width 64-byte `r || s` representation
required by COSE. Signer providers may return DER ECDSA signatures; the
representation conversion stays inside the paper adapter.

Verification is offline when a trust store is supplied. A matching public key
verifies the signature, and an optional `TrustStore.isTrusted()` policy
separates `VALID_TRUSTED` from `VALID_UNTRUSTED`. No matching public key or no
trust store produces `UNVERIFIABLE`; a bad signature or mutation produces
`INVALID`. Lifecycle remains `UNCHECKED` until a later status adapter supplies
an independent lifecycle result.

## Size and parser limits

- COSE_Sign1 is limited to 1200 bytes before Base45.
- Oversize encoding throws `PaperSealSizeError`; claims are never silently dropped.
- CBOR is definite-length only, rejects tags/floats/indefinite forms and has
  bounded depth and collection sizes.
- Base45 rejects invalid characters, invalid group lengths and oversized
  input.
- QR PNG decoding is limited to 4 MiB and 4096 × 4096 pixels.

## Manual demo

From the repository root:

```bash
pnpm --filter @credaryn/paper demo:encode
pnpm --filter @credaryn/paper demo:verify -- artifacts/paper/invoice-11800.png --trust providers/local/demo-trust-store.json
```

The first command writes a QR PNG, a CRD1 text payload and a development-only
public trust file. The second command decodes the PNG and prints the signed
invoice number, total, issuer, key ID, `VALID_TRUSTED`,
`PAPER_CLAIMS_ONLY` and the offline trust source. Point `--trust` at an empty
directory to get `UNVERIFIABLE`; mutate one Base45 character to get `INVALID`.
