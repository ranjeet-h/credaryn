# Release verification checklist

Checks that require a human, a real device, a real account, or real infrastructure. They cannot be
satisfied by code alone. Work through the relevant sections before a release and record each result.

OCR/visible-content comparison is outside the cryptographic trust path and therefore has no release
checks.

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

A check stays **open** until an observed result is recorded. Do not mark a check from memory.

---

## Legal and registry

- [ ] **Legal/trademark clearance** for "Credaryn" in the intended markets.
- [ ] **Reserve the final domain.**
- [ ] **Reserve the npm organisation/scope** (`@credaryn`).
- [ ] **Reserve the GitHub organisation.**
- [ ] **ISO 22376 review**: review the implemented Paper Seal Profile against the complete ISO 22376
      text before making any formal conformance claim (currently VDS-informed, not conformant).

---

## Physical compatibility corpus

- [ ] **Two real printers** — print the sealed invoice; verify the QR survives printer output.
- [ ] **Two phone cameras** — scan the printed QR; verify signed claims without the original PDF.
- [ ] **One scanner** — scan the printed document; verify the QR decodes.
- [ ] **Record the public compatibility corpus**: printer/camera/scanner models, document profile,
      capture conditions, result, limitations. No universal print/scan claim may be made.

Commands / pages:

```bash
pnpm demo:start                                                   # http://localhost:3000
pnpm --filter @credaryn/paper demo:encode -- --fixture invoice-11800
pnpm credaryn paper inspect <payload-or-image>
```

---

## Browser printing

- [ ] **B1** Run `pnpm --filter @credaryn/example-browser-print dev`; open the printed URL in a real browser.
- [ ] **B2** Confirm the page contains an explicit seal target and no seal is injected elsewhere.
- [ ] **B3** Click **Prepare print**; confirm a QR + human-readable signed-claim text appear and the page
      reports `PAPER_CLAIMS_ONLY`.
- [ ] **B4** Open the browser print preview; confirm print CSS includes the seal.
- [ ] **B5** Click **Prepare and print** with the signing endpoint stopped; confirm **no print dialog** opens
      and the page shows the issuance failure.
- [ ] **B6** Inspect the served JS bundle and Network panel; confirm no private key, raw signature
      operation, or third-party network request.
- [ ] **B7** Print to PDF, scan the QR, and verify with `pnpm credaryn paper inspect`.
- [ ] **B8** Record browser/OS, screenshot, and observed result.

---

## Key providers and HSM

Repository smoke examples first (mock clients, no credentials):

- [ ] **K0** Run each and confirm an immutable versioned key + `HEALTHY` status and no private bytes:
      `pnpm --filter @credaryn/example-aws-kms issue`,
      `pnpm --filter @credaryn/example-gcp-kms issue`,
      `pnpm --filter @credaryn/example-azure-key-vault issue`,
      `pnpm --filter @credaryn/example-pkcs11 issue`.

Real provider checks (accounts/keys controlled by the operator):

- [ ] **K1 AWS KMS** — inject an official SDK client for an `ECC_NIST_P256` key; issue a Paper Seal; verify
      with the returned public key; record the key version.
- [ ] **K2 Google Cloud KMS** — `EC_SIGN_P256_SHA256` key; same verification; record the key version.
- [ ] **K3 Azure Key Vault / Managed HSM** — P-256 key; same verification; record the key version.
- [ ] **K4 PKCS#11 / SoftHSM2** — `docker compose -f providers/pkcs11/docker-compose.soft-hsm.yml up -d`
      then `pnpm --filter @credaryn/pkcs11 example:issue`; record slot/key identity.
- [ ] **K5 Key rotation review** — `pnpm key-rotation:demo`; confirm the new key is authorized before
      activation, only the active key signs new documents, and an old document still verifies.

> Provider packages use hand-rolled injected clients by design
> ([ADR 0006](docs/adr/0006-hand-rolled-provider-clients.md)); re-run K1–K4 against real SDK clients.

---

## Self-hosted deployment

- [ ] **D1** `docker compose -f deploy/docker-compose.yml up -d`; open the configured verifier URL.
- [ ] **D2** Verify a controlled PDF by upload, paste its CRD1 payload, and use a camera/image input;
      confirm all paths agree.
- [ ] **D3** Air-gapped / offline: disable network (or use a local trust bundle); confirm PDF and paper
      crypto verification still works and lifecycle freshness is marked unavailable/stale.
- [ ] **D4** Call each REST endpoint with `curl`; confirm valid responses match the CLI fixture result and
      oversize/malformed input is rejected before deep parsing.
- [ ] **D5** Open the Web Component test page; confirm separate cards for crypto validity, issuer trust,
      artifact integrity, signed claims, lifecycle, security mode, and evidence.
- [ ] **D6** As an admin test user, perform one status transition and inspect append-only audit output;
      confirm verification endpoints remain anonymous/read-only.
- [ ] **D7** Inspect service-worker storage and logs; confirm uploaded files, raw preimages, tokens, and
      private keys are absent.
- [ ] **D8** Stop the optional status database; confirm a historically valid signature stays
      cryptographically valid with `UNCHECKED` status.
- [ ] **D9** Record browser/OS, screenshots, and Compose output.

> Note: Compose includes optional `status`/`admin` profiles and an air-gapped override, and
> same-origin CORS works by default. D6 needs operator OIDC configuration; D3 uses the air-gapped
> profile. Real PostgreSQL and OIDC/JWKS runs are operator/device steps.

---

## Release and supply chain

- [ ] **R1 Independent security review** — commission it; record every material finding, fix, or
      explicitly risk-accepted item with the responsible maintainer and rationale.
- [ ] **R2 GitHub private vulnerability reporting** — enable and verify it in repository settings
      (before public beta).
- [ ] **R3 Dependency risk decision** — fix, upgrade, or explicitly risk-accept the 5 moderate
      TrustVC/BBS transitive findings (`docs/security/dependency-audit.md`).
- [ ] **R4 Release-candidate review** — clean install from published artifacts; verify the signed tag,
      npm provenance, and OIDC/trusted-publishing dry run **without long-lived credentials**.
- [ ] **R5 Threat-model review** — read `docs/threat-model/credaryn-v1-v2.md` against the implemented
      boundaries and confirm each mitigation has a test or operational control.
- [ ] **R6** Release stable 1.0 only after R1–R5 are satisfied.

---

## End-to-end journeys

- [ ] **J1 Issuer developer** — follow `docs/getting-started.md`; connect a signer; issue and retain the invoice.
- [ ] **J2 PDF recipient** — verify the sealed PDF via SDK, CLI, Web Component, PWA, and REST; identical fields.
- [ ] **J3 Paper recipient** — print, use two real cameras and one scanner, verify without the PDF.
- [ ] **J4 Tamper scenario** — edit the PDF and the visible paper amount to INR 81,800; confirm digital
      mutation failure and that the signed paper value stays INR 11,800 (no OCR verdict expected).
- [ ] **J5 Enterprise administrator** — exercise trust configuration, key rotation, OIDC administration,
      lifecycle status, retention, and audit export.
- [ ] **J6 Self-host operator** — deploy Compose with no Credaryn account/hosted dependency; repeat verification.
- [ ] **J7 Air-gapped operator** — disable network; verify crypto evidence; confirm status is clearly
      unavailable/stale.
- [ ] **J8 Security auditor** — reproduce a paper vector, validate a PDF with DSS + the independent
      validator, inspect threat model, SBOM, signed release, and no-secret scan.
- [ ] **J9 Compatibility corpus** — record printer/camera/scanner model, profile, capture conditions,
      result, limitations (public corpus).
- [ ] **J10** Record the results.

> Note: the audit scripts (`project:audit`, `final:user-journeys`, `final:self-host-check`,
> `final:air-gap-check`) now exist and fail closed until evidence is recorded, so J1–J10 can be
> executed and recorded.

---

## Approvals

- [ ] **Browser printing** — approve the browser-printing path after the browser-printing checks pass.
- [ ] **Key providers** — approve after every production key-provider check has a recorded result.
- [ ] **Self-hosted deployment** — approve after the self-hosted platform is operational.
- [ ] **Stable 1.0** — approve only after the security and release checks pass.
- [ ] **Final acceptance** — accept the final evidence and explicitly move any remainder to the
      post-completion backlog.
