# ADR 0005: UI verification is manual; no Playwright/browser automation

- Status: accepted for Phase 12
- Date: 2026-09-18
- Supersedes: spec §18 "Browser/E2E tests: Playwright"

## Decision

Browser and end-to-end UI verification is **manual only**. No Playwright (or equivalent browser automation) dependency, test runner or fixture is added. The execution plan's global constraint is the governing decision.

Supporting detail:

- `pnpm compatibility:report` records the manual-only browser verification mode.
- The proof for Criterion C (browser print) is the documented manual review in `docs/security/browser-print.md` plus the static bundle inspection in `scripts/check-browser-bundle.mjs`.
- Server-rendered surfaces (verifier REST API, CLI, SDK) remain covered by Vitest; the browser-facing UI is intentionally thin and manually reviewed.

## Rationale

Browser automation pulls in a large downloadable runtime, needs network access, and cannot observe the physical outputs (print rendering, camera capture, scanner input) that are the actual risk surface for the paper/browser bridge. Manual review with explicit, recorded observations is a better fit than an automated proxy that could give false confidence.

## Consequences

- No automated regression protection for UI markup, Web Component behaviour or the PWA routes; the `docs:check` documentation test is the only UI-adjacent automated check.
- Manual browser checkpoints must be recorded in the Milestone 12 report; `final:user-journeys` fails closed until owner acceptance is recorded.
- Adding Playwright later requires a new ADR and removes the "manual only" claim from the compatibility report.
