# Key management

Credaryn keeps key custody outside the core packages. A signer adapter receives an application-owned client, returns immutable public metadata, and exposes only `sign(Uint8Array)` to the paper/PDF flows. Private key bytes are never part of `SignerKeyInfo`, `ProviderKeyMaterial`, a Paper Seal payload, or a verification result.

## Provider support level

| Provider | Adapter | Supported boundary | Credentials in this repository |
| --- | --- | --- | --- |
| AWS KMS | `@credaryn/provider-aws-kms` | `ECC_NIST_P256`, `ECDSA_SHA_256`, DER → COSE `r\|\|s` conversion | No |
| Google Cloud KMS | `@credaryn/provider-gcp-kms` | `EC_SIGN_P256_SHA256`, public-key retrieval, health | No |
| Azure Key Vault / Managed HSM | `@credaryn/provider-azure-key-vault` | P-256, ES256 digest signing, public-key retrieval | No |
| PKCS#11 / SoftHSM2 | `@credaryn/pkcs11` | ECDSA SHA-256 through injected PKCS#11 client | No |

The adapters intentionally do not import cloud SDKs or a low-level PKCS#11 library. The host application constructs the SDK client and injects it into the adapter. This keeps SDK versioning, credential resolution, regional endpoints, token refresh, and HSM session policy in the application that owns those concerns.

## Examples and credentials

The provider examples run with deterministic injected mock clients:

```bash
pnpm --filter @credaryn/example-aws-kms issue
pnpm --filter @credaryn/example-gcp-kms issue
pnpm --filter @credaryn/example-azure-key-vault issue
pnpm --filter @credaryn/example-pkcs11 issue
```

They prove the same Paper Seal semantics, versioned key identity, health shape, and no-private-material boundary. They do **not** create cloud resources, read credentials, or claim that a provider integration has been validated against a production account. A real deployment supplies an official provider client at the adapter constructor and runs the same example flow with a test key.

Never commit credentials, service-account JSON, access keys, PINs, token files, or private key exports. Use the provider's normal environment/metadata identity or an external secret manager, and grant only public-key retrieval, health/read, and signing permissions for the selected version.
