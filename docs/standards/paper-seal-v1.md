# Paper Seal Profile v1 standard

The normative implementation profile is documented in [Paper Seal Profile v1](../architecture/paper-seal-profile-v1.md). Published binary, CBOR, COSE, Base45, QR, descriptor, and expected-value examples are under [`test-vectors/paper-v1/`](../../test-vectors/paper-v1/README.md).

The stable transport prefix is `CRD1:`. Breaking interpretation changes require a new prefix/profile version; V1 payloads are never silently reinterpreted. The profile uses RFC 8949 deterministic CBOR, RFC 9052 COSE_Sign1, ES256, RFC 9285 Base45, and QR error correction M. It is not a new cryptographic algorithm or a claim of ISO 22376 conformance.
