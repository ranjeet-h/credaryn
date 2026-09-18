# Security policy

Credaryn handles signed document claims and document bytes. Report suspected
vulnerabilities privately; do not include secrets, customer documents, or
unreleased exploit details in a public issue.

## Reporting

Use the repository's [GitHub private vulnerability reporting
channel](https://github.com/ranjeet-h/credaryn/security/advisories/new). If the
channel is disabled, enable it in the repository Security settings before
public beta and use the private contact configured there.

Include:

- affected commit, package, and runtime;
- a minimal reproduction without confidential data;
- security impact and required privileges;
- any mitigation already applied.

The maintainer will acknowledge a report privately, reproduce it in an isolated
environment, assign severity, and coordinate a fix or explicit risk acceptance
before public disclosure. Do not rely on this project for jurisdiction-specific
qualified electronic-signature status; technical validation and legal status
are separate claims.

## Security boundaries

- Verify Paper Seal and PDF signatures before treating claims as authentic.
- Treat issuer trust, artifact integrity, lifecycle, and OCR evidence as
  separate facts.
- Keep private keys in the configured signer/provider boundary; local demo keys
  are development-only.
- Keep OCR optional and outside the cryptographic path.
- Enforce bounded inputs and fail closed on malformed encodings.

See [the threat model](docs/threat-model/credaryn-v1-v2.md) and
[incident response](docs/security/incident-response.md).
