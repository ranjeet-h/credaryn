# Getting started

This guide reproduces the Credaryn invoice proof on a local machine. It uses
Node 24, pnpm 12 and the Dockerized DSS 6.5 reference adapter.

## 1. Install and start DSS

```bash
pnpm install --frozen-lockfile
docker compose -f adapters/pades-dss/docker-compose.yml up -d
curl -fsS http://localhost:8080/health
```

The health response must report the DSS adapter as ready before signing.

## 2. Build and run the playground

```bash
pnpm demo:build
pnpm demo:start
```

Open <http://localhost:3000> in a real browser. The browser flow is manual:

If port 3000 is already in use, the playground automatically selects the next
available local port and prints the exact URL to open.

1. Select **Generate and seal invoice**.
2. Select **Verify PDF** and **Verify Paper Seal**.
3. Open the signed PDF if you want to inspect its viewer signature panel.
4. Select **Tamper PDF → INR 81,800**.
5. Verify that the PDF becomes `INVALID` while the Paper Seal remains
   `VALID_TRUSTED` with `PAPER_CLAIMS_ONLY` and INR 11,800.00.

No Playwright, browser automation, or automated UI runner is part of this
manual check.

## 3. CLI comparison

The same generated artifacts can be inspected from another terminal:

```bash
pnpm credaryn verify artifacts/invoice-11800/sealed.pdf --trust ./trust
pnpm credaryn paper inspect artifacts/invoice-11800/paper-seal.txt --trust ./trust
```

The local demo trust material is development-only. Do not reuse it for
production signing or trust decisions.
