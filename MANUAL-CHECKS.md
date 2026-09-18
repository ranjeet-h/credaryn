# MANUAL-CHECKS.md — Owner-run checks (nothing here can be automated)

Purpose: every remaining check that **requires a human, real device, real account, or real
infrastructure**. These cannot be satisfied by code or CI. Work top to bottom, record the result,
then tick the matching box in the milestone plan and update the phase report.

Reference files:
- Plan: `docs/superpowers/plans/2026-09-16-credaryn-milestone-execution-plan.md`
- Spec: `complete-product-specification-architecture-implementation-roadmap.md`
- Project-done checklist: `docs/project-done-checklist.md`

**OCR / V3 is intentionally not planned** (plan Phase 11), so it has no manual checks.

## How to record a check

For each item, fill in:

```text
Date:            <YYYY-MM-DD>
Operator:        <name>
Environment:     <OS, browser, device model, account/region>
Steps run:       <exact commands / page actions>
Observed result: <what actually happened>
Evidence:        <screenshot path, logs, hashes>
Verdict:         PASS / FAIL / PARTIAL
```

Then: tick the matching `- [ ]` in the plan, write it into `docs/verification/milestone-<N>.md`,
and commit. A check stays **open** until an observed result is recorded — do not mark from memory.

---

## A. Pre-public / legal and registry (spec §24) — cannot be automated

- [ ] **A1 Legal/trademark clearance** for "Credaryn" in intended markets.
- [ ] **A2 Reserve final domain.**
- [ ] **A3 Reserve npm organisation/scope** (`@credaryn`).
- [ ] **A4 Reserve GitHub organisation.**
- [ ] **A5 ISO 22376 review**: review the implemented Paper Seal Profile against the complete ISO 22376
      text before making any formal conformance claim (currently VDS-informed, not conformant).
- [ ] **A6 Independent security review** completed before stable 1.0 (also Phase 10 / F1).

---

## B. V1 beta physical-compatibility corpus (spec §18 / plan global constraint) — real hardware

- [ ] **B1 Two real printers** — print the sealed invoice; verify the QR survives printer output.
- [ ] **B2 Two phone cameras** — scan the printed QR; verify signed claims without the original PDF.
- [ ] **B3 One scanner** — scan the printed document; verify the QR decodes.
- [ ] **B4 Record the public compatibility corpus**: printer/camera/scanner models, document profile,
      capture conditions, result, limitations. No universal print/scan claim may be made.

Commands / pages: use the Phase 5 demo (`pnpm demo:start`, `http://localhost:3000`) or the Phase 2 paper
demo (`pnpm --filter @credaryn/paper demo:encode -- --fixture invoice-11800`), then
`pnpm credaryn paper inspect <payload-or-image>` for verification.

---

## C. Phase 6 — Browser print path (report `docs/verification/milestone-6.md` says PENDING)

- [ ] **C1** Run `pnpm --filter @credaryn/example-browser-print dev`; open the printed URL in a real browser.
- [ ] **C2** Confirm the page contains an explicit seal target and no seal is injected elsewhere.
- [ ] **C3** Click **Prepare print**; confirm a QR + human-readable signed-claim text appear and the page
      reports `PAPER_CLAIMS_ONLY`.
- [ ] **C4** Open the browser print preview; confirm print CSS includes the seal.
- [ ] **C5** Click **Prepare and print** with the signing endpoint stopped; confirm **no print dialog** opens
      and the page shows the issuance failure.
- [ ] **C6** Inspect the served JS bundle and Network panel; confirm no private key, raw signature
      operation, or third-party network request.
- [ ] **C7** Print to PDF, scan the QR, and verify with `pnpm credaryn paper inspect`.
- [ ] **C8** Record browser/OS, screenshot, and observed result; release the Phase 6 STOP.

---

## D. Phase 7 — Production key providers and HSM (reports `milestone-7-*.md` say PENDING)

Repository smoke examples first (mock clients, no credentials):

- [ ] **D0** Run each and confirm an immutable versioned key + `HEALTHY` status and no private bytes:
      `pnpm --filter @credaryn/example-aws-kms issue`,
      `pnpm --filter @credaryn/example-gcp-kms issue`,
      `pnpm --filter @credaryn/example-azure-key-vault issue`,
      `pnpm --filter @credaryn/example-pkcs11 issue`.

Real provider checkpoints (owner-controlled accounts/keys):

- [ ] **D1 AWS KMS** — inject an official SDK client for an `ECC_NIST_P256` key; issue a Paper Seal; verify
      with the returned public key; record key version. `docs/verification/milestone-7-aws.md`.
- [ ] **D2 Google Cloud KMS** — `EC_SIGN_P256_SHA256` key; same verify; record version.
      `docs/verification/milestone-7-gcp.md`.
- [ ] **D3 Azure Key Vault / Managed HSM** — P-256 key; same verify; record version.
      `docs/verification/milestone-7-azure.md`.
- [ ] **D4 PKCS#11 / SoftHSM2** — `docker compose -f providers/pkcs11/docker-compose.soft-hsm.yml up -d`
      then `pnpm --filter @credaryn/pkcs11 example:issue`; record slot/key identity.
      `docs/verification/milestone-7-pkcs11.md`.
- [ ] **D5 Key rotation review** — `pnpm key-rotation:demo`; confirm the new key is authorized before
      activation, only the active key signs new documents, and an old document still verifies.
      `docs/verification/milestone-7-rotation.md`.
- [ ] **D6** Record all sub-reports and release the Phase 7 STOP.

> Note: provider packages use hand-rolled injected clients by design
> ([ADR 0006](docs/adr/0006-hand-rolled-provider-clients.md)); re-run D1–D4 against real SDK clients.

---

## E. Phase 8 — Self-hosted verifier platform (report `milestone-8.md` says PENDING)

- [ ] **E1** `docker compose -f deploy/docker-compose.yml up -d`; open the configured verifier URL.
- [ ] **E2** Verify the Phase 3 PDF by upload, paste its CRD1 payload, and use a camera/image input;
      confirm all paths agree.
- [ ] **E3** Air-gapped / offline: disable network (or use a local trust bundle); confirm PDF and paper
      crypto verification still works and lifecycle freshness is marked unavailable/stale.
- [ ] **E4** Call each REST endpoint with `curl`; confirm valid responses match the CLI fixture result and
      oversize/malformed input is rejected before deep parsing.
- [ ] **E5** Open the Web Component test page; confirm separate cards for crypto validity, issuer trust,
      artifact integrity, signed claims, lifecycle, security mode, and evidence.
- [ ] **E6** As an admin test user, perform one status transition and inspect append-only audit output;
      confirm verification endpoints remain anonymous/read-only.
- [ ] **E7** Inspect service-worker storage and logs; confirm uploaded files, raw preimages, tokens, and
      private keys are absent.
- [ ] **E8** Stop the optional status database; confirm a historically valid signature stays
      cryptographically valid with `UNCHECKED` status.
- [ ] **E9** Record browser/OS, screenshots, Compose output, and release the Phase 8 STOP.

> Note: Compose now includes optional `status`/`admin` profiles and an air-gapped override, and
> same-origin CORS works by default. E6 needs operator OIDC configuration; E3 uses the air-gapped
> profile. Real PostgreSQL and OIDC/JWKS runs are operator/device steps.

---

## F. Phase 10 — Security and release gates (report `milestone-10.md` says BLOCKED)

- [ ] **F1 Independent security review** — commission it; record every material finding, fix, or
      owner-approved risk acceptance with owner + rationale.
- [ ] **F2 GitHub private vulnerability reporting** — enable and verify it in repository settings
      (before public beta).
- [ ] **F3 Dependency risk decision** — fix, upgrade, or explicitly risk-accept the 5 moderate
      TrustVC/BBS transitive findings (`docs/security/dependency-audit.md`).
- [ ] **F4 Real release-candidate review** — clean install from published artifacts; verify the signed tag,
      npm provenance, and OIDC/trusted-publishing dry run **without long-lived credentials**.
- [ ] **F5 Threat-model review** — read `docs/threat-model/credaryn-v1-v2.md` against the implemented
      boundaries and confirm each mitigation has a test or operational control.
- [ ] **F6** Release stable 1.0 only after F1–F5 and the plan's Phase 10 STOP are satisfied.

---

## G. Phase 12 — Final user journeys and completion audit

- [ ] **G1 Issuer developer** — follow `docs/getting-started.md`; connect a signer; issue and retain the invoice.
- [ ] **G2 PDF recipient** — verify the sealed PDF via SDK, CLI, Web Component, PWA, and REST; identical fields.
- [ ] **G3 Paper recipient** — print, use two real cameras and one scanner, verify without the PDF.
- [ ] **G4 Tamper scenario** — edit the PDF and the visible paper amount to INR 81,800; confirm digital
      mutation failure and that the signed paper value stays INR 11,800 (no OCR verdict expected).
- [ ] **G5 Enterprise administrator** — exercise trust configuration, key rotation, OIDC administration,
      lifecycle status, retention, and audit export.
- [ ] **G6 Self-host operator** — deploy Compose with no Credaryn account/hosted dependency; repeat verification.
- [ ] **G7 Air-gapped operator** — disable network; verify crypto evidence; confirm status is clearly
      unavailable/stale.
- [ ] **G8 Security auditor** — reproduce a paper vector, validate a PDF with DSS + the independent
      validator, inspect threat model, SBOM, signed release, and no-secret scan.
- [ ] **G9 Compatibility corpus** — record printer/camera/scanner model, profile, capture conditions,
      result, limitations (public corpus).
- [ ] **G10** Save `docs/verification/milestone-12.md`, then release the final STOP.

> Note: the Phase 12 audit scripts (`project:audit`, `final:user-journeys`, `final:self-host-check`,
> `final:air-gap-check`) and the required docs now exist and fail closed until evidence is recorded,
> so G1–G10 can be executed and recorded.

---

## H. Phase STOP approvals (explicit owner release, cannot be automated)

- [ ] **H1 Phase 6 STOP** — release browser-printing checkpoint.
- [ ] **H2 Phase 7 STOP** — release after every production key-provider checkpoint report exists.
- [ ] **H3 Phase 8 STOP** — release after the self-host platform is operational.
- [ ] **H4 Phase 10 STOP** — release stable 1.0 only after F1–F6.
- [ ] **H5 Phase 12 STOP** — accept the final A–N evidence and explicitly move any remainder to the
      post-completion backlog.
