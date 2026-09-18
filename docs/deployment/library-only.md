# Library-only deployment

Embed `@credaryn/node` for issuance and `@credaryn/verifier` for verification. The application injects its signer, PDF engine, trust store, and optional status lookup. Core packages are stateless and require no Credaryn account or hosted endpoint.

Keep signing credentials in the selected KMS/HSM, enforce input limits, and retain uploaded bytes only under the application's documented policy. See [getting started](../getting-started.md), [key management](../key-management/index.md), and [trust policy](../trust/x509-did-web.md).
