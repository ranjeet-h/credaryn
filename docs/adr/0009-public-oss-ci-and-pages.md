# ADR 0009: Public OSS launch — CI, Pages landing site, and repository hygiene

- Status: accepted
- Date: 2026-09-18
- Supersedes: ADR 0004 (for the public OSS posture only; the local-first test gates remain)

## Context

Credaryn was developed with a deliberate "no GitHub Actions CI" posture while the design was
unstable (ADR 0004), with verification run locally and by the owner. The project is now being
released as **public open source** under Apache-2.0.

Public credibility for a trust/security product depends on evidence that is visible to
contributors and evaluators: an automated gate on every pull request, a public security policy and
private vulnerability reporting, contribution and conduct guidelines, and a marketing landing page
that links the documentation. A private repository with local-only verification undercuts adoption.

## Decision

1. Add GitHub Actions CI that runs `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`,
   enforced `--coverage` thresholds and `docs:check` on pushes and pull requests to `master`, plus a
   high-severity dependency audit and a committed-secret pattern guard.
2. Add CodeQL analysis for `javascript-typescript` (public repositories get this at no cost).
3. Add a static landing site under `site/`, deployed to GitHub Pages with the official Pages
   Actions (`configure-pages` / `upload-pages-artifact` / `deploy-pages`), so there is no Jekyll
   build step and no `gh-pages` branch to maintain.
4. Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates and `CITATION.cff`.
5. Enable GitHub private vulnerability reporting and make the repository public.

## Consequences

- The "no CI" decision in ADR 0004 no longer applies to the public repository; the local-first test
  gates and the "UI verification is manual" decision (ADR 0005) are unchanged. Browser/device and
  cloud-provider acceptance remain owner-run (see `MANUAL-CHECKS.md`).
- CI requires network access to install dependencies and, for the coverage gate, to run the full
  suite; DSS/HSM/TSA-dependent tests skip when their services are unavailable.
- The landing page is a static asset hosted on GitHub Pages; the project docs remain Markdown in
  `docs/` and are linked from the site to their GitHub URLs.
- Release provenance, signed tags and npm trusted publishing remain owner-run until packages are
  published; this ADR does not claim them.
