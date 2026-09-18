# Invoice tamper demo

The demo is deliberately concrete:

1. Credaryn issues invoice `INV-2026-82919` for **INR 11,800.00**.
2. The invoice PDF receives a PAdES Baseline B-B signature.
3. The same invoice carries a CRD1 Paper Seal whose signed claim is
   `totalMinor = 1180000` and `currency = INR`.
4. The demo renders a changed visible total of **INR 81,800.00** while keeping
   the original Paper Seal.
5. The changed PDF is not the signed artifact and verifies as `INVALID`.
6. The Paper Seal still verifies as `VALID_TRUSTED`, with
   `PAPER_CLAIMS_ONLY`, and reports INR 11,800.00.

Run it with:

```bash
docker compose -f adapters/pades-dss/docker-compose.yml up -d
pnpm demo:start
```

Then open <http://localhost:3000> and follow the two on-screen steps: issue the
original invoice, then change the visible amount.
The demo explains the evidence first; PAdES, COSE and CBOR implementation
details are intentionally kept in the architecture documentation.

This is evidence of a signed issuance and artifact integrity. It is not a
claim that a document cannot be edited, and it does not establish a legal
signature qualification without the applicable trust, identity and legal
context.
