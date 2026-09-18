# ADR 0005: UI verification is manual; no Playwright/browser automation

- Status: accepted
- Date: 2026-09-18
- Supersedes: the earlier Playwright browser/E2E test requirement

## Decision

Browser and end-to-end UI verification is **manual only**. No Playwright (or equivalent browser automation) dependency, test runner or fixture is added.

Supporting detail:

- `pnpm compatibility:report` records the manual-only browser verification mode.
- Browser print verification relies on the documented manual review in `docs/security/browser-print.md` plus the static bundle inspection in `scripts/check-browser-bundle.mjs`.
- Server-rendered surfaces (verifier REST API, CLI, SDK) remain covered by Vitest; the browser-facing UI is intentionally thin and manually reviewed.

## Rationale

Browser automation pulls in a large downloadable runtime, needs network access, and cannot observe the physical outputs (print rendering, camera capture, scanner input) that are the actual risk surface for the paper/browser bridge. Manual review with explicit, recorded observations is a better fit than an automated proxy that could give false confidence.

## Consequences

- No automated regression protection for UI markup, Web Component behaviour or the PWA routes; the `docs:check` documentation test is the only UI-adjacent automated check.
- Manual browser verification must be recorded; `final:user-journeys` fails closed until the review is recorded.
- Adding Playwright later requires a new ADR and removes the "manual only" claim from the compatibility report.
