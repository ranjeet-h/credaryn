# PAdES conformance boundary

## V1 profile

Credaryn V1 targets PAdES Baseline B-B through the isolated European
Commission DSS 6.5 adapter. The application supplies a completed PDF as
bounded bytes; DSS owns the PDF signature operation and the configured signing
credential. The Node packages receive only normalized JSON and `Uint8Array`
values.

The controlled invoice flow is:

```text
descriptor
  -> signed CRD1 Paper Seal transport
  -> Puppeteer HTML/CSS render with QR and human-readable transport
  -> PDF bytes
  -> explicit paper-seal placement boundary
  -> sha256 artifact digest
  -> DSS PAdES Baseline B-B signature
  -> DSS validation
```

The seal is present in the exact byte sequence passed to DSS. Any mutation of
the signed PDF, including a content or metadata change, must therefore fail
digital artifact integrity validation. The Paper Seal remains independently
verifiable as `PAPER_CLAIMS_ONLY`; it does not prove that unknown print or
photograph bytes equal the signed PDF.

## Normalized contract

`DssPdfSignatureEngine` sends:

- bounded Base64 PDF bytes;
- `operation` (`sign` or `verify`);
- `signatureRequest.level` (`B-B`) and the generated `sha256:` artifact digest;
- public issuer/key/algorithm identity for sign requests.

It never sends private-key bytes, Java objects, DSS classes or frontend data.
Responses are accepted only when the signature level is exactly `B-B`, the
reported cryptographic and artifact states are valid for signing, and
`qualifiedSignature` is explicitly `false`.

## B-T and legal scope

PAdES Baseline B-T is not implemented by the current DSS adapter. Requests that
select B-T are rejected with an explicit RFC 3161 configuration error; they are
not silently converted to B-B. A PAdES Baseline B-B result is not, by itself, a
qualified electronic signature. Qualified status depends on jurisdictional
requirements, qualified certificates and qualified trust-service evidence;
Credaryn does not infer or advertise that status from a DSS result.

## Independent verification expectation

Milestone 3 uses DSS as the reference validator. Stable 1.0 remains blocked
until the security-hardening milestone validates these fixtures with at least
one independent compatible validator and records the compatibility result.
