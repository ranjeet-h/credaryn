# Paper Seal Profile v1 Phase 0 vector

This vector records the deterministic unsigned payload produced by the Phase 0 standards spike for `descriptor.json`.

| Field | Value |
| --- | --- |
| Profile version | `1` |
| Transport prefix | `CRD1:` |
| Encoding probe | deterministic CBOR payload inside COSE_Sign1 |
| Signature algorithm | ES256 / P-256 / SHA-256 |
| Key ID | `phase-0-ephemeral` |
| Payload SHA-256 | `98b86f31a820dc17431b531dabfc68232ca61dca9fe4795579c01b4158665d60` |

Run the reproducible probe from the repository root:

```bash
pnpm --filter @credaryn/paper spike
```

The command generates a fresh development-only P-256 key in memory, emits a CRD1 transport, prints the payload hash and verifies the COSE proof with an in-memory trust store. The payload hash must match the value above. The complete transport changes between runs because the Phase 0 OpenSSL signer uses a fresh ECDSA nonce; deterministic COSE test vectors are frozen in Milestone 2 with the production profile implementation.

The vector intentionally contains no private key or certificate secret.
