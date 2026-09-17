# V1 verifier input matrix

The CLI and web verifier accept the same bounded inputs and dispatch them
through `@credaryn/verifier`.

| Input | Detection | Maximum | Explicit content types | Result security mode |
| --- | --- | ---: | --- | --- |
| PAdES PDF | `%PDF-` magic bytes | 16 MiB | `application/pdf` | `DIGITAL_ARTIFACT_SIGNED` |
| CRD1 text | UTF-8 text beginning `CRD1:` | 64 KiB | `text/plain`, `text/vnd.credaryn.crd1` | `PAPER_CLAIMS_ONLY` |
| Paper Seal PNG | PNG signature bytes, then QR decode | 4 MiB | `image/png` | `PAPER_CLAIMS_ONLY` |

The auto-detect route requires the bytes to identify one of these formats. An
explicit content type must agree with the magic bytes where magic bytes exist;
otherwise the request fails closed as ambiguous. Unsupported content types,
invalid UTF-8, oversized bodies, malformed QR/Paper Seal payloads and unknown
formats do not reach a deep verifier.

## Cross-surface parity

For the same bytes and trust bundle, the library, CLI and HTTP response retain
the same values for `verdict`, `cryptographicValidity`, `trustDecision`,
issuer/key identity, trust source, artifact integrity, signed claims, lifecycle
status, security mode and evidence. JSON serialization is the only
delivery-specific difference.

The local development CA command creates a JSON trust bundle marked
`developmentOnly: true` and `local-development-only`. It is test material,
not a production trust anchor. Omitting trust material produces
`UNVERIFIABLE`, never `VALID_TRUSTED`.
