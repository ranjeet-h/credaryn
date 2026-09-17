# Provider adapter contract

Each enterprise adapter implements the `ManagedSignerProvider` contract from `@credaryn/core`:

```ts
interface ManagedSignerProvider extends SignerProvider {
  getPublicKey(): Promise<SignerKeyInfo>;
  healthCheck(): Promise<ProviderHealth>;
}
```

The injected client is deliberately narrower than an SDK client. It must provide:

1. immutable public key metadata (`issuerId`, provider key ID, provider version, ES256, public key and certificate fingerprint),
2. a provider-specific digest-signing call, and
3. a health call that does not expose secret material.

Adapters normalize failures to `ProviderError` with a provider name, stable code, message, and retryability. Callers must not parse vendor exception classes. A missing key, denied operation, malformed public-key response, or unavailable provider is an explicit failure; it cannot become a trusted result.

AWS KMS returns DER ECDSA signatures. `providers/aws-kms/src/der-to-cose.ts` validates the canonical DER and converts it to fixed-width `r || s` for the shared ES256 vector. The public `SignerProvider` boundary still returns DER because the Paper Seal COSE layer owns the final representation conversion.
