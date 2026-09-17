# Milestone 8 verification report

Date: 2026-09-17

## Automated checks

All checks ran on branch `master` with Node `v24.13.1` and pnpm `12.3.3`.
No Playwright, browser automation, or automated UI runner was used.

| Check | Result |
| --- | --- |
| `pnpm lint` | PASS; core boundary check passed for 10 TypeScript files |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS; 42 files, 136 tests |
| Phase 8 focused tests | PASS; trust policy, widget view model, status, admin security, API, verifier, and print tests |
| `docker compose -f deploy/docker-compose.yml config` | PASS |
| `docker compose --profile status -f deploy/docker-compose.yml config` | PASS |
| `pnpm deploy:smoke` against a local verifier server | PASS; `/v1/health` and `/v1/version` |
| `pnpm docs:check` | PASS |
| `pnpm bundle:inspect` | PASS |
| `pnpm format:check` | PASS |

Implemented boundaries include versioned REST health/version routes, strict
configured-origin CORS, rate limiting, correlation IDs, bounded request bodies
and timeouts, static-only service-worker caching, an escaped standards-based
Web Component result view, trust policy resolution, append-only status history,
admin authorization/CSRF/cookie helpers, redacted structured logs, and an
optional PostgreSQL Compose profile.

## Manual self-host/UI checkpoint — pending owner verification

No automated UI testing was used. The owner must inspect the rendered states
manually in a normal browser and inspect the Compose containers:

1. Run `docker compose -f deploy/docker-compose.yml up -d` and open
   `http://localhost:8080`.
2. Upload the Phase 3 PDF, paste its CRD1 payload, and use a phone/camera
   image input. Confirm the result separates cryptographic validity, issuer
   trust, artifact integrity, signed claims, lifecycle, security mode, and
   evidence.
3. Open the browser's native offline/application storage view. Confirm only
   static assets are cached; uploaded PDF/PNG bytes and history are absent.
4. Run the REST `curl` checks from the Phase 8 plan. Confirm malformed and
   oversized inputs are rejected before verifier dispatch and responses carry
   correlation IDs.
5. Review the Web Component result page manually. Confirm escaped claims and
   separate result cards; do not use a browser automation tool.
6. Stop the optional status database and verify historical cryptographic
   validity remains separate from lifecycle freshness.
7. Inspect container user, read-only filesystem, healthchecks, logs, and secret
   mounts. Confirm no uploaded documents, tokens, private keys, or raw
   preimages appear.
8. Repeat with network disabled and local trust material to complete the
   air-gapped check.

Record observations here:

```text
Manual status: PENDING
Browser/OS: pending
Screenshot or owner visual notes: pending
Compose startup/health: pending
Offline verification: pending
Air-gapped status freshness: pending
Storage/log redaction: automated utility passed; owner inspection pending
```

## STOP decision

The Phase 8 implementation and automated gates pass. This phase is stopped
until the owner completes the manual browser, Compose, storage, and air-gapped
checks and explicitly approves Phase 9. OCR remains explicitly not planned.
