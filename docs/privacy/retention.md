# Privacy and retention

Verification inputs are processed in memory and are not retained by default. Core SDKs are stateless. The optional status database stores lifecycle identifiers/history, not document bodies. Trust configuration is operator-controlled, and audit output goes to operator-selected logging/SIEM infrastructure.

Operators must define purpose, legal basis, retention period, deletion/subject-request process, access control, backup expiry, and geographic requirements for their deployment. Logs must omit raw documents, images, signed claim payloads unless explicitly necessary, credentials, tokens, private keys, and PINs. Correlation IDs and redacted event metadata are preferred. A hosted integrator that changes these defaults must disclose and enforce its own policy.
