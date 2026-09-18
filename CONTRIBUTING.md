# Contributing to Credaryn

Thanks for helping build trust infrastructure for verifiable documents. This project is
standards-first and security-sensitive, so a few conventions matter more than usual.

## Ways to contribute

- **Bug reports** — use the issue templates. Include the exact command, expected result and observed result.
- **Feature / adapter proposals** — open a feature request first; new document generators, providers or
  language SDKs are welcome but must converge on the same `DocumentDescriptor` and `VerificationResult`.
- **Docs** — fixes and clarifications are valuable; keep claims accurate and never overstate security.
- **Code** — see the workflow below.
- **Security issues** — do **not** open a public issue. Follow [`SECURITY.md`](SECURITY.md).

## Development setup

Requirements: Node.js 24 LTS, pnpm 12, Docker (for the local EU DSS 6.5 reference adapter).

```bash
pnpm install --frozen-lockfile
docker compose -f adapters/pades-dss/docker-compose.yml up -d   # PAdES reference engine
pnpm typecheck
pnpm lint
pnpm test
pnpm exec vitest run --coverage
```

Useful scripts: `pnpm test:property`, `pnpm test:fuzz -- --time-limit=120`,
`pnpm test:mutation -- --changed-only`, `pnpm docs:check`, `pnpm pades:validate:all`,
`pnpm vectors:reproduce`.

## What we expect in a change

- **Test-first.** Add a failing test that describes the behaviour, then implement it.
- **Security fixes require a regression test** before the fix is merged.
- **Respect the trust boundaries.** `@credaryn/core` must not import DSS/Java, Puppeteer, TrustVC,
  cloud SDKs, OCR libraries, database clients or browser globals. Provider/vendor types stay inside
  their adapter. `pnpm lint` enforces this.
- **Never put private keys, credentials, customer documents or unnecessary PII** in source, tests,
  fixtures, screenshots or logs.
- **Keep the normalized result model.** New surfaces must consume the shared verifier rather than
  reimplementing signature or trust logic.
- **Fail closed.** Bound every untrusted input before deep parsing; reject unknown critical fields.
- **Determinism.** Golden vectors are committed for deterministic CBOR/COSE/Base45/QR output. If a
  change alters them intentionally, regenerate and explain why.
- **No unsupported claims.** Do not use "unhackable", "uneditable", "AI-proof", or describe a PAdES
  result as a qualified electronic signature.

## Pull request workflow

1. Fork or branch from `master`.
2. Make a focused change with tests.
3. Run the full gate locally:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test && pnpm exec vitest run --coverage && pnpm docs:check
   ```
4. Open a pull request using the template and describe the behaviour and the evidence.
5. All gates above must pass locally. A maintainer will review; the project does not run CI (only the Pages deployment workflow exists).

Sign off your commits with the [Developer Certificate of Origin](https://developercertificate.org/)
(`git commit -s`). By contributing you agree your contribution is licensed under the project's
[Apache-2.0 licence](LICENSE).

## Commit style

Conventional commits are appreciated: `fix(core): …`, `feat(provider-aws-kms): …`,
`docs: …`, `test: …`, `chore: …`.

## Code of conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Project decisions

Architecture decisions live in [`docs/adr`](docs/adr). The product definition and architecture are
summarized in the [README](README.md).
