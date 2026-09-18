# TrustVC / W3C VC interoperability

Credaryn keeps W3C VC interoperability in `standards/trustvc`. The adapter uses TrustVC's ECDSA-SD-2023 implementation and does not alter `@credaryn/core`, the Paper Seal profile, or the PAdES path.

- Production identity shape: `did:web` with a hosted DID document.
- Local/test identity: `did:key`, resolved without network access.
- Credential context: W3C VC Data Model v2 and Data Integrity v2.
- Selective disclosure: ECDSA-SD-2023 derivation only.
- Status: W3C Bitstring Status List v1.0 entry shape.

Run the fixture checks with `pnpm interop:vectors:check`. The example writes only a signed credential and public DID document under ignored `artifacts/w3c-vc/`; the private multibase key remains in memory and is never written to the artifact directory. The committed `test-vectors/w3c/did-web/` files are public interoperability fixtures.

The adapter reports cryptographic validity separately from any enterprise trust decision. A valid W3C proof is not automatically a trusted issuer.
