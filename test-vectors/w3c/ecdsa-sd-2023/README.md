# W3C ECDSA-SD-2023 vectors

Fixtures consumed by `standards/trustvc/src/verifier.ts` through
`standards/trustvc/test/interoperability.test.ts`.

- `credential.json` — a base ECDSA-SD-2023 proof issued to a local `did:key`
  identity, with `/credentialSubject/invoiceNumber` mandatory.
- `derived-credential.json` — a selective-disclosure derivation that reveals
  `invoiceNumber` and omits `totalMinor`.

Both are static snapshots: verification is deterministic, but regenerating them
is not byte-reproducible because the issuer assigns a fresh `id` and `created`
timestamp. Do not embed private key material in these files.
