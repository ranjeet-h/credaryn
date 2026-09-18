# Trust documentation

Start with [X.509, trust bundles, and did:web](x509-did-web.md) and the [core trust model](../architecture/trust-model.md). Operators select trust anchors and allow-listed resolution policy. A mathematically valid signature is not automatically a trusted issuer, and network failure never upgrades trust.

Offline deployments use operator-controlled public trust bundles. Private keys are never trust-bundle content.
