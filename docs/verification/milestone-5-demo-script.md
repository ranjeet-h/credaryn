# Milestone 5 manual demo script

This is the user-owned browser checkpoint for the launch-quality invoice demo.
Use a real browser only; do not use Playwright or another browser automation
runner.

## Setup

```bash
pnpm install --frozen-lockfile
docker compose -f adapters/pades-dss/docker-compose.yml up -d
pnpm demo:start
```

Open <http://localhost:3000>.

## Checkpoint A — original issuance

1. Click **Generate and seal invoice**.
2. Confirm the page shows `INV-2026-82919` and INR 11,800.00.
3. Click **Verify PDF**. Confirm the result is `VALID_TRUSTED` and artifact
   integrity is `VALID`.
4. Click **Verify Paper Seal**. Confirm the result is `VALID_TRUSTED`, the
   signed claim is INR 11,800.00, and the mode is `PAPER_CLAIMS_ONLY`.
5. Open the signed PDF and inspect the signature panel if available.

## Checkpoint B — visible tamper

1. Click **Tamper PDF → INR 81,800**.
2. Open the tampered preview and confirm the visible total is INR 81,800.00.
3. Confirm the demo reports PDF `INVALID`.
4. Confirm the Paper Seal still reports `VALID_TRUSTED` and INR 11,800.00.

Record the browser, OS, PDF viewer, observed labels, generated artifact SHA-256
values and screenshots in `docs/verification/milestone-5.md` after the manual
check. Stop there and explicitly release the next milestone.
