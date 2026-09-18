# W3C Bitstring Status List v1.0 vectors

Fixtures matching the credential/status-entry shapes produced by
`standards/trustvc/src/status-list.ts` and asserted by
`standards/trustvc/test/interoperability.test.ts`.

- `status-list-credential.json` — a `BitstringStatusListCredential` using the
  W3C status context `https://www.w3.org/ns/credentials/status/v1`.
- `status-entry.json` — the `BitstringStatusListEntry` referencing index `7`.

The legacy `https://w3id.org/vc/status-list/2021/v1` context must never appear
in these fixtures.
