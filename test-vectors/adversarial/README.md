# Adversarial input corpus

This directory is reserved for bounded, public negative fixtures. It must not
contain private keys, signing credentials, customer documents, or intentionally
unbounded decompression payloads.

The test corpus covers these classes through generated inputs and
focused fixtures:

- changed `issuerId`, `documentId`, claims, COSE payloads, key identifiers, and
  post-signing PDF bytes;
- malformed and non-canonical CBOR, COSE, Base45, certificate-shaped input, and
  unsupported critical headers;
- oversized PDF, PNG, Paper Seal, claim, and nested-input boundaries;
- copied, missing, or untrusted Paper Seals;
- unknown lifecycle and trust material without upgrading cryptographic results.

Keep new fixtures deterministic, small, and reproducible from a test or script.
