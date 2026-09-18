# Pull request

## What and why

<!-- Describe the behaviour change and the problem it solves. Link the issue. -->

## Evidence

<!-- Exact commands and observed results; fixture hashes if vectors changed. -->

- [ ] Tests added or updated (test-first where practical)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (trust boundaries)
- [ ] `pnpm test` passes
- [ ] `pnpm exec vitest run --coverage` passes thresholds
- [ ] `pnpm docs:check` passes (if docs/README changed)

## Scope and safety

- [ ] No private keys, credentials, customer documents or unnecessary PII are included
- [ ] Untrusted inputs remain bounded and parsers fail closed
- [ ] The normalized `VerificationResult` model is preserved
- [ ] No custom cryptography or incompatible trust path was introduced
- [ ] No unsupported security claims ("unhackable/uneditable/AI-proof", qualified-signature overclaim)

## Notes for reviewers

<!-- Anything reviewers should know: trade-offs, follow-ups, manual steps. -->
