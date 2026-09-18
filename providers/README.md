# Enterprise signer providers

This directory holds the first-party signer adapters for AWS KMS, Google Cloud
KMS, Azure Key Vault, local keys and PKCS#11/HSM.

## Injected-client boundary is intentional (D-3)

The adapters are deliberately built against **injected, hand-rolled client
interfaces** rather than importing the official AWS/Google/Azure SDKs or a
low-level PKCS#11 library. This is a recorded decision, not a missing
integration:

- Only `@credaryn/core` contracts cross the adapter boundary; the host
  application constructs and injects the vendor client.
- Credentials, endpoint/region policy, token refresh and native-module loading
  stay with the application that owns them.
- Adapters normalise vendor failures and return only public key material. They
  never export private bytes.
- Signature-format normalisation is the adapter's responsibility. AWS KMS
  returns DER ECDSA signatures, so `providers/aws-kms/src/der-to-cose.ts`
  validates canonical DER and converts it to the fixed-width 64-byte COSE
  `r || s` form. The Paper Seal COSE layer accepts either canonical DER or a
  fixed-width 64-byte ES256 result so cloud and HSM adapters share one signing
  contract.

This override is recorded in `docs/adr/0006-hand-rolled-provider-clients.md`
(cloud SDKs) and `docs/adr/0007-pkcs11-manual-opt-in.md` (PKCS#11/SoftHSM2).
Adapters are validated against injected client doubles rather than the official
SDKs; the supported boundary of each provider is summarized in
[`docs/key-management/index.md`](../docs/key-management/index.md), and runnable
example flows live under `examples/`.

## Tests

- Shared golden vectors and per-adapter encodings:
  `providers/shared/test/shared-vectors.test.ts`.
- Provider contract doubles: `providers/*/test/*.test.ts`.
- The PKCS#11 SoftHSM2 integration test is opt-in and skipped by default; see
  `providers/pkcs11/test/pkcs11-softhsm.integration.test.ts` for the operator
  procedure and the documented native-dependency limitation.
