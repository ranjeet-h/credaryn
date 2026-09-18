# ADR 0009: Public OSS launch and landing page (GitHub Pages only; no CI)

- Status: accepted
- Date: 2026-09-18
- Related: ADR 0004 (no CI; local verification gates), ADR 0005 (manual UI verification)

## Context

Credaryn is being released as **public open source** under Apache-2.0. The project deliberately runs
its verification locally (ADR 0004) and does not operate continuous
integration. Public release still needs a marketing landing page that links the documentation, and
community hygiene so contributors know how to participate.

## Decision

1. **No continuous integration.** There is no build/test CI and no CodeQL workflow. Verification
   stays local exactly as described in ADR 0004; contributors run the checks documented
   in `CONTRIBUTING.md` before opening a pull request.
2. **One GitHub Actions workflow only:** `pages.yml`, which builds the static landing site under
   `site/` and deploys it to GitHub Pages using the official Pages actions. This is a deployment job,
   not CI, and its scope is limited to the landing page.
3. Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates and `CITATION.cff`.
4. Enable GitHub private vulnerability reporting and make the repository public.

## Consequences

- No CI status checks or badges; README badges are limited to static metadata (licence, Node, pnpm,
  standards, website, status).
- The landing page is a static asset served by GitHub Pages. Project documentation stays as Markdown
  in `docs/` and is linked from the site to its GitHub URLs.
- Release provenance, signed tags and npm trusted publishing remain manual release steps; this ADR does not
  claim them.
- Because there is no PR pipeline, reviewers rely on the documented local checks plus the committed
  golden vectors, coverage thresholds and test suite.
