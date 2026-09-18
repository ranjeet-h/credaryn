# Threat-model assumptions

These assumptions define what Credaryn claims and what it does not claim.

1. The signing key is protected by the selected provider. A compromised or
   stolen issuer key can produce cryptographically valid fraudulent documents;
   key rotation and lifecycle status are operational controls, not signature
   magic.
2. Trust material is supplied by the verifier. A valid signature from an
   unknown issuer is not automatically trusted.
3. The verifier can validate bytes and signed claims, but cannot prove that a
   printed, photographed, or re-rendered page is identical to the signed PDF.
4. OCR is probabilistic evidence supplied by an integrating application. It
   never upgrades an invalid or untrusted cryptographic result.
5. DSS 6.5 is the current reference PAdES validator. Stable release claims
   require an independent compatible validator before publication.
6. Network, status, and public DID services may be unavailable or compromised.
   Unknown status stays unknown and does not become trusted.
7. Adapters are potentially malicious or buggy. They must communicate through
   bounded byte and normalized-result contracts and must not import core trust
   internals from outside their declared boundary.
