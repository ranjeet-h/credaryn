# Phase gates

Credaryn implementation is sequential and phase-gated. Every milestone follows this order:

1. Write acceptance criteria and a test matrix.
2. Write and run a failing test (RED).
3. Implement the smallest behavior that passes (GREEN).
4. Refactor while keeping the tests green.
5. Run focused tests, typecheck, boundary lint and the phase's automated gates.
6. Run the exact manual verification procedure and record observed results.
7. Save `docs/verification/milestone-<N>.md`.
8. STOP and wait for explicit user release before the next milestone.

Later phases may not be implemented while an earlier phase is failing. UI changes are never tested with Playwright, browser automation, or another automated UI runner; open the real browser/device and perform the documented interaction manually. Automated checks may cover pure state, API, build, parser and security-boundary behavior, but they do not replace manual UI verification. A manual checkpoint is evidence about the running product, not permission to skip automated checks. A network failure may never turn unknown trust into trusted status, and OCR evidence may never replace cryptographic verification.
