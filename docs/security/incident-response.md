# Incident response

## Triage

1. Keep the report private and preserve the reporter's reproduction.
2. Classify the issue as key compromise, signature/verifier bypass, input
   denial of service, trust/lifecycle confusion, data exposure, or release
   integrity.
3. Identify affected commits, versions, providers, adapters, and artifacts.
4. Reproduce with synthetic fixtures in an isolated environment; never copy
   customer documents into tests or logs.

## Containment

- If a signing key may be compromised, stop issuance, revoke or quarantine the
  key, publish lifecycle status, and rotate through the configured provider.
- If verification is affected, disable the affected adapter or input path and
  prefer `INVALID`/`UNVERIFIABLE` over a trusted result.
- Preserve signed artifacts, hashes, logs, and dependency metadata needed for
  the investigation while removing secrets from copies.

## Recovery and disclosure

1. Add a regression test before the fix.
2. Patch the root boundary and rerun focused, fuzz, full, and release checks.
3. Review the threat model and compatibility claims for stale wording.
4. Prepare a private advisory with impact, affected versions, fixed versions,
   mitigation, and credit preference.
5. Disclose through GitHub private vulnerability reporting after mitigation is
   available and coordinate downstream notification where required.

No incident response step upgrades a cryptographically invalid artifact or
converts OCR evidence into authenticity.
