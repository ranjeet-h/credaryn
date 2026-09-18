Documents are easy to edit. Credaryn makes authentic issuance independently verifiable - from software to paper.

# Credaryn

**Trust infrastructure for verifiable documents.** Cryptographic authenticity from software to paper.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/ranjeet-h/credaryn/actions/workflows/ci.yml/badge.svg)](https://github.com/ranjeet-h/credaryn/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ranjeet-h/credaryn/actions/workflows/codeql.yml/badge.svg)](https://github.com/ranjeet-h/credaryn/actions/workflows/codeql.yml)
[![Website](https://img.shields.io/badge/website-ranjeet--h.github.io%2Fcredaryn-38e0c4.svg)](https://ranjeet-h.github.io/credaryn/)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-12-orange.svg)](https://pnpm.io)
[![Standards](https://img.shields.io/badge/standards-PAdES%20%C2%B7%20COSE%20%2F%20CBOR%20%C2%B7%20W3C%20VC%20%C2%B7%20ISO%2022376--informed-success)](#standards-and-interoperability)
[![Status](https://img.shields.io/badge/status-pre--1.0-yellow.svg)](docs/project-done-checklist.md)

Credaryn is open-source, standards-first infrastructure for issuing and verifying authentic
business documents across **digital PDF** and **physical paper**. It seals a generated PDF with a
standards-compatible PAdES signature, binds business-critical claims, carries those claims onto paper
as a signed machine-readable seal, and verifies both through **one normalized result model** — with
no mandatory cloud service.

> The problem is not that documents can be edited. It is that a recipient has no simple, independent
> way to know what the real issuer originally issued. Credaryn makes that verification boring for
> developers and obvious for recipients.

---

## Table of contents

- [Why Credaryn](#why-credaryn)
- [Top features](#top-features)
- [How it works](#how-it-works)
- [Quickstart (60 seconds)](#quickstart-60-seconds)
- [Packages](#packages)
- [Usage](#usage)
  - [1. Issue and seal a PDF](#1-issue-and-seal-a-pdf)
  - [2. Create a paper seal](#2-create-a-paper-seal)
  - [3. Verify anything (one result model)](#3-verify-anything-one-result-model)
  - [4. CLI](#4-cli)
  - [5. REST API and web verifier](#5-rest-api-and-web-verifier)
  - [6. Browser printing](#6-browser-printing)
  - [7. Cloud KMS / HSM signing](#7-cloud-kms--hsm-signing)
  - [8. W3C / TrustVC interoperability](#8-w3c--trustvc-interoperability)
  - [9. Embeddable verifier widget](#9-embeddable-verifier-widget)
- [Verification result model](#verification-result-model)
- [The Paper Seal Profile v1](#the-paper-seal-profile-v1)
- [Security model](#security-model)
- [Deployment models](#deployment-models)
- [Standards and interoperability](#standards-and-interoperability)
- [CLI reference](#cli-reference)
- [REST API reference](#rest-api-reference)
- [Compatibility](#compatibility)
- [Documentation](#documentation)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Roadmap and project status](#roadmap-and-project-status)
- [Security policy](#security-policy)
- [License](#license)

---

## Why Credaryn

Most teams assemble the same trust stack by hand: one library for PDF signatures, another model for
structured claims, a bespoke approach for paper, separate KMS integration, and a different
verification UX for each. Credaryn is the **orchestration layer** that makes them work together.

- **Standards underneath, simplicity on top.** Credaryn does not invent cryptographic algorithms or a
  proprietary trust envelope. It composes PAdES, COSE/CBOR, X.509/PKI and W3C Verifiable
  Credentials, and aligns with ISO 22376 Visible Digital Seal concepts for paper.
- **Paper is a first-class medium**, not an afterthought. A printed copy still carries
  independently verifiable signed claims even after the PDF bytes are lost.
- **One normalized verifier** across PDF, paper and scan input, with cryptographic validity, issuer
  trust, artifact integrity, signed claims, lifecycle status and security mode reported **separately**.
- **No mandatory central service.** Core cryptographic verification runs offline with local trust
  material. Self-hosting is a core requirement, not an add-on.
- **Enterprise-ready signing.** Local development signer plus AWS KMS, Google Cloud KMS, Azure Key
  Vault / Managed HSM and a PKCS#11/HSM boundary — your issuer identity stays in your KMS/HSM.

**Credaryn is not** a generic file-sealing product, a timestamping network, an e-signature workflow,
a certificate authority, a blockchain proof system or a multi-format authenticity tool. It is the
bridge between exact digital authenticity, signed business claims and physical-paper verification.

---

## Top features

| | Feature |
|---|---|
| 🔐 | **PAdES PDF signatures** (Baseline B-B; optional B-T with an RFC 3161 TSA) through an isolated EU DSS 6.5 adapter, with no DSS/Java types leaking into Node packages. |
| 📄 | **Signed business claims** bound into the issued document — money as integer minor units + ISO currency, never floating point. |
| 🧾 | **Paper Seal Profile v1**: `CRD1:` + Base45 + deterministic CBOR + COSE_Sign1 + ES256, QR error-correction M, fail-closed 1200-byte limit. |
| ✅ | **One normalized verification result** for PDF, CRD1 text and QR images: `VALID_TRUSTED`, `VALID_UNTRUSTED`, `INVALID`, `UNVERIFIABLE`. |
| 🏢 | **Enterprise trust**: configured public keys, X.509 anchors and `did:web`, with the actual trust method reported (`ENTERPRISE_ANCHOR`, `X509_CHAIN`, `DID_WEB_DOMAIN`, `UNCONFIGURED`). |
| 🔑 | **KMS/HSM signers**: AWS KMS (`ECC_NIST_P256`), Google Cloud KMS (`EC_SIGN_P256_SHA256`), Azure Key Vault/Managed HSM (P-256/ES256), PKCS#11/SoftHSM2 — all ES256, no private key ever leaves the provider. |
| 🖨️ | **Browser printing** (`@credaryn/web`): prepares a page with a signed QR seal and reports `PAPER_CLAIMS_ONLY` — it never pretends to sign unknown OS print bytes. |
| 🧩 | **Embeddable verifier** (`@credaryn/widget`) as a framework-neutral Web Component, plus a self-hosted PWA and REST API. |
| 🗂️ | **Lifecycle status** service (ACTIVE / REVOKED / CANCELLED / SUPERSEDED / EXPIRED) separate from immutable issuance validity, with a PostgreSQL repository and W3C Bitstring Status List v1.0 for credentials. |
| 🤝 | **W3C / TrustVC interoperability**: `did:web` + ECDSA-SD-2023 without contaminating the core document path. |
| 📦 | **Self-hostable**: Docker Compose reference deployment, optional status/admin profiles and an air-gapped override. |
| 🧪 | **Test-first**: golden vectors, property tests, fuzz/mutation/adversarial parser tests, DSS + independent (`pdfsig`) validation. |

---

## How it works

```
Application
   │  DocumentDescriptor  (issuer, documentId, documentType, issuedAt, claims)
   ▼
Credaryn SDK  ──►  Signer / KMS / HSM          (private keys never leave your boundary)
   │
   ├─► PDF   adapter  → PAdES (B-B / B-T)      exact digital artifact
   ├─► Paper adapter  → CRD1 + Base45 + COSE   signed claims that survive printing
   └─► VC    adapter  → W3C / TrustVC          optional interoperability
   │
   ▼
Credaryn Verify  ──►  one normalized VerificationResult
```

A controlled issuance flows: **render → place Paper Seal → hash → PAdES sign → distribute**.
A verification flows: **detect input → verify signature → resolve trust → (optional) lifecycle →
one result**. Cryptographic validity never depends on trust resolution, OCR or network access.

---

## Quickstart (60 seconds)

Requirements: **Node.js 24 LTS**, **pnpm 12**, and **Docker** (for the local DSS 6.5 reference adapter).

```bash
git clone https://github.com/ranjeet-h/credaryn.git
cd credaryn
pnpm install --frozen-lockfile

# 1) Start the PAdES reference adapter
docker compose -f adapters/pades-dss/docker-compose.yml up -d
curl -fsS http://127.0.0.1:8080/health   # -> {"status":"ready", ...}

# 2) Build and run the invoice demo
pnpm demo:build
pnpm demo:start   # open http://localhost:3000
```

In the playground: **Generate and seal invoice** (total **INR 11,800**) → **Verify PDF** /
**Verify Paper Seal** → **Tamper PDF → INR 81,800**. The PDF becomes `INVALID` while the Paper Seal
still reports the signed **INR 11,800**.

Full walkthrough: [docs/getting-started.md](docs/getting-started.md) ·
Demo story: [docs/demo/invoice-tamper-demo.md](docs/demo/invoice-tamper-demo.md).

> The demo signing key is development-only. PAdES Baseline B-B is not by itself a qualified
> electronic signature; see [Legal scope](#license).

---

## Packages

All packages are pre-1.0 workspace packages (version `0.0.0`); they are used from the monorepo and
will be published with semantic versioning.

| Package | Purpose |
|---|---|
| `@credaryn/core` | Contracts, descriptor validation, trust/verdict policy, and the normalized result model. |
| `@credaryn/node` | Primary server SDK and orchestration (`Credaryn`). |
| `@credaryn/pdf` | PDF pipeline and the `PdfSignatureEngine` abstraction. |
| `@credaryn/paper` | Paper Seal Profile v1 encode / render / decode / verify. |
| `@credaryn/verifier` | Shared verification engine (library, used by CLI and REST). |
| `@credaryn/web` | Browser print preparation and seal placement. |
| `@credaryn/widget` | Framework-neutral embeddable verifier Web Component. |
| `@credaryn/provider-local` | Development-only local signer. |
| `@credaryn/provider-aws-kms` | AWS KMS ES256 signer. |
| `@credaryn/provider-gcp-kms` | Google Cloud KMS ES256 signer. |
| `@credaryn/provider-azure-key-vault` | Azure Key Vault / Managed HSM ES256 signer. |
| `@credaryn/pkcs11` | Isolated PKCS#11/HSM signer boundary. |
| `@credaryn/adapter-pades-dss` | Dockerized EU DSS 6.5 PAdES adapter. |
| `@credaryn/standards-trustvc` | TrustVC / W3C VC interoperability. |
| `@credaryn/cli` | The `credaryn` CLI. |
| `@credaryn/status` | Optional lifecycle-status service (PostgreSQL). |
| `@credaryn/observability` | Structured logging and OpenTelemetry tracing. |
| `@credaryn/admin` | Optional issuer/status administration API (OIDC/JWKS). |
| `@credaryn/verifier-web` | Self-hosted verifier PWA + REST API. |
| `@credaryn/playground` | The invoice tamper demo. |

---

## Usage

### 1. Issue and seal a PDF

```ts
import { Credaryn } from "@credaryn/node";
import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";
import { AwsKmsSigner } from "@credaryn/provider-aws-kms";

const credaryn = new Credaryn({
  pdfEngine: new DssPdfSignatureEngine({
    endpoint: process.env.DSS_URL ?? "http://127.0.0.1:8080",
    timestampAuthorityUrl: process.env.DSS_TSA_URL, // optional -> PAdES B-T
  }),
  paperSigner: new AwsKmsSigner({ client }),
  trustStore,                       // operator-controlled
  keyLifecycle,                     // optional: only ACTIVE keys may sign
});

const sealedPdf = await credaryn.sealPdf(pdfBytes, {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-09-18T00:00:00Z",
  claims: { invoiceNumber: "INV-2026-82919", totalMinor: 1180000, currency: "INR" },
});
```

For the full controlled pipeline (render → seal → hash → sign) use `createPdfPipeline` from
`@credaryn/pdf`; the reference integration lives in
[`examples/invoice-puppeteer`](examples/invoice-puppeteer).

### 2. Create a paper seal

```ts
// CRD1 transport string (print as a QR code)
const transport = new TextDecoder().decode(await credaryn.createPaperSeal(descriptor));
// -> "CRD1:...."
```

`@credaryn/paper` can also render the QR PNG and decode it back. Only the claims you put in the
descriptor are signed; the full source document and unnecessary PII must never be placed in the QR.

### 3. Verify anything (one result model)

```ts
import { createVerifier } from "@credaryn/verifier";

const verifier = createVerifier({ pdfEngine, paperSigner, trustStore, statusResolver });

const result = await verifier.verifyInput({ bytes }); // auto-detects PDF / CRD1 text / QR PNG
// or verify a printed copy against the expected document:
await verifier.verifyPaperText(crd1, undefined, expectedDescriptor);
```

```jsonc
{
  "verdict": "VALID_TRUSTED",
  "cryptographicValidity": "VALID",
  "trustDecision": "TRUSTED",
  "artifactIntegrity": "VALID",
  "lifecycleStatus": "ACTIVE",
  "securityMode": "DIGITAL_ARTIFACT_SIGNED",
  "issuerId": "acme-retail",
  "keyId": "issuer-key-v3",
  "signedClaims": { "totalMinor": 1180000, "currency": "INR" },
  "evidence": [{ "code": "PDF_VALID", "message": "PDF cryptographic validity is valid" }]
}
```

### 4. CLI

```bash
pnpm credaryn seal pdf input.pdf --descriptor invoice.json --out sealed.pdf
pnpm credaryn verify sealed.pdf --trust ./trust
pnpm credaryn verify doc.png --trust ./trust --descriptor expected.json
pnpm credaryn paper inspect CRD1:... --trust ./trust
pnpm credaryn key inspect cert.pem
pnpm credaryn dev-ca init          # development-only trust material
```

### 5. REST API and web verifier

```bash
docker compose -f deploy/docker-compose.yml up -d   # verifier on :8080 + DSS
```

```bash
curl -F file=@sealed.pdf       http://localhost:8080/v1/verify/pdf
curl -F file=@paper-seal.png   http://localhost:8080/v1/verify/paper
curl -H 'content-type: text/vnd.credaryn.crd1' --data-binary @seal.crd1 http://localhost:8080/v1/verify
curl http://localhost:8080/v1/health
```

Open `http://localhost:8080` for the PWA: upload a PDF, scan a QR with the camera, upload an image,
or paste a `CRD1:` payload. Optional profiles: `--profile status` (PostgreSQL lifecycle) and
`--profile admin`. See [docs/deployment/docker-compose.md](docs/deployment/docker-compose.md).

### 6. Browser printing

```ts
import { prepareAndPrint } from "@credaryn/web";

await prepareAndPrint({
  descriptor,
  issueSealUrl: "/api/issue-seal",   // your server, which holds the signer
  target: "credaryn-seal",
});
```

The browser never receives a private key, and the result is always `PAPER_CLAIMS_ONLY`.
See [docs/security/browser-print.md](docs/security/browser-print.md).

### 7. Cloud KMS / HSM signing

All first-party providers expose the same `SignerProvider` contract and use P-256/SHA-256, so one
issuer identity serves both PDF and paper paths. Adapters are constructed with an injected official
client, so credentials never enter Credaryn packages.

| Provider | Configuration |
|---|---|
| AWS KMS | `ECC_NIST_P256` + `ECDSA_SHA_256`; DER → COSE `r\|\|s` conversion in the adapter. |
| Google Cloud KMS | `EC_SIGN_P256_SHA256` (SOFTWARE or HSM). |
| Azure Key Vault | P-256 / ES256 (Managed HSM recommended for dedicated HSM). |
| PKCS#11 | Isolated behind `SignerProvider`; SoftHSM2 reference path. |

See [docs/key-management/index.md](docs/key-management/index.md) and
[docs/key-management/rotation.md](docs/key-management/rotation.md).

### 8. W3C / TrustVC interoperability

Optional and isolated from the core document path: `did:web` (production) / `did:key` (local),
ECDSA-SD-2023, and W3C Bitstring Status List v1.0 for credential status. See
[docs/interop/trustvc.md](docs/interop/trustvc.md).

### 9. Embeddable verifier widget

```html
<credaryn-verifier></credaryn-verifier>
<script type="module">
  import { defineCredarynVerifier } from "@credaryn/widget";
  defineCredarynVerifier();
</script>
```

---

## Verification result model

Cryptographic validity, issuer trust, artifact integrity, signed claims, lifecycle status and
security mode are **independent dimensions** — never collapsed into a single "authentic" flag.

| Verdict | Meaning |
|---|---|
| `VALID_TRUSTED` | Required checks pass and the issuer chains to a configured trusted identity. |
| `VALID_UNTRUSTED` | The signature is internally valid but the issuer is not trusted by the current trust configuration. **Never shown as authentic.** |
| `INVALID` | A signature, integrity check or signed-claim binding failed. |
| `UNVERIFIABLE` | Required evidence is missing, unsupported or cannot be resolved. |

Lifecycle is separate: `ACTIVE`, `REVOKED`, `CANCELLED`, `SUPERSEDED`, `EXPIRED`, `UNCHECKED`.
Security mode is separate: `DIGITAL_ARTIFACT_SIGNED` (controlled PDF) vs `PAPER_CLAIMS_ONLY`
(unknown OS print bytes). Full contract: [docs/architecture/verification-result.md](docs/architecture/verification-result.md).

A **status** of `VALID_TRUSTED` with `lifecycleStatus: REVOKED` is a correct, useful outcome: the
document is authentic *and* cancelled. A network failure never turns unknown trust into trusted.

---

## The Paper Seal Profile v1

Purpose: carry a small set of signed business-critical claims onto paper so they remain
independently checkable after the PDF bytes are lost through printing/scanning.

| Property | Value |
|---|---|
| Carrier | QR Code (error-correction level M) |
| Transport | `CRD1:` + Base45 ([RFC 9285](https://www.rfc-editor.org/rfc/rfc9285)) |
| Serialization | Deterministic CBOR ([RFC 8949](https://www.rfc-editor.org/rfc/rfc8949), core-deterministic ordering) |
| Signature | COSE_Sign1 ([RFC 9052](https://www.rfc-editor.org/rfc/rfc9052)) with ES256 (P-256/SHA-256) |
| Size limit | 1200 bytes before Base45 transport; **fails closed** (claims are never dropped) |
| Fields | `version`, `issuerId`, `keyId`/certificate fingerprint, `documentId`, `documentType`, `issuedAt`, `claims`; optional status reference and artifact digest |

Specification and binary examples: [docs/standards/paper-seal-v1.md](docs/standards/paper-seal-v1.md) and
[docs/architecture/paper-seal-profile-v1.md](docs/architecture/paper-seal-profile-v1.md).

---

## Security model

- **Keys never leave your boundary.** Production APIs never handle raw private-key bytes; local
  development keys are explicitly labelled development-only and untrusted outside the demo trust store.
- **Trust is explicit.** A fetched key is not trusted merely because it was fetched; the verifier's
  trust policy decides. Trust method is reported (`ENTERPRISE_ANCHOR`, `X509_CHAIN`,
  `DID_WEB_DOMAIN`, `UNCONFIGURED`).
- **Fail-closed parsing.** All untrusted PDF, QR, CBOR, COSE, certificate, image and remote-URL
  inputs have explicit size and time limits before deep parsing; unknown critical fields/algorithms
  are rejected.
- **Offline-first.** Core verification needs no Credaryn service. Uploaded bytes are processed
  ephemerally by default; verification history is off by default.
- **Separate facts.** OCR/visible-content analysis (integrating application's own layer) is evidence
  with confidence and never changes cryptographic validity.

Threat model: [docs/threat-model/index.md](docs/threat-model/index.md) ·
Security policy: [SECURITY.md](SECURITY.md).

---

## Deployment models

| Model | Description |
|---|---|
| **Library-only** | Embed the SDKs; you manage trust/status. See [docs/deployment/library-only.md](docs/deployment/library-only.md). |
| **Self-hosted standard** | Docker Compose: verifier + DSS, optional PostgreSQL-backed status/admin profiles. See [docs/deployment/docker-compose.md](docs/deployment/docker-compose.md). |
| **Enterprise** | SDK + enterprise KMS/HSM + configured trust bundle/`did:web` + verifier/status services. See [docs/deployment/enterprise.md](docs/deployment/enterprise.md). |
| **Air-gapped** | Local trust bundles, offline PDF/paper verification, lifecycle explicitly unavailable/stale. See [docs/deployment/air-gapped.md](docs/deployment/air-gapped.md). |

---

## Standards and interoperability

- **PAdES** (ETSI) for PDF authenticity/integrity, via EU DSS 6.5, with independent `pdfsig` validation in the test suite.
- **COSE / CBOR** (IETF) for the paper seal, with published, reproducible golden vectors.
- **W3C Verifiable Credentials 2.0** via TrustVC, `did:web` and ECDSA-SD-2023.
- **W3C Bitstring Status List v1.0** for credential status.
- **X.509 / PKI / KMS / HSM** for enterprise key and trust management.
- **ISO 22376 Visible Digital Seal concepts** inform the paper profile. Credaryn does **not** claim
  ISO 22376 conformance until the implemented profile is reviewed against the complete standard.

Interoperability matrix: [docs/compatibility/interoperability-matrix.md](docs/compatibility/interoperability-matrix.md).

---

## CLI reference

| Command | Description |
|---|---|
| `credaryn seal pdf <in> --descriptor <json> --out <pdf>` | Sign a controlled PDF (PAdES B-B). |
| `credaryn verify <in> --trust <dir> [--descriptor <json>]` | Verify a PDF, `CRD1:` payload or QR image. |
| `credaryn paper inspect <payload-or-image> --trust <dir>` | Inspect/verify a Paper Seal. |
| `credaryn key inspect <cert.pem>` | Inspect key/certificate metadata. |
| `credaryn dev-ca init` | Generate **development-only** trust material. |

Exit codes: `0` success, `2` input error, `1` other failure. Output is JSON on stdout.

---

## REST API reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/verify` | Auto-detect PDF / CRD1 / PNG and verify. |
| `POST` | `/v1/verify/pdf` | Verify a PDF (`application/pdf`). |
| `POST` | `/v1/verify/paper` | Verify a CRD1 payload or QR image. |
| `GET` | `/v1/health` | Liveness/readiness metadata. |
| `GET` | `/v1/version` | Build and compatibility metadata. |

OpenAPI: [openapi/v1.yaml](openapi/v1.yaml) · [docs/api/openapi.yaml](docs/api/openapi.yaml).
Public verification endpoints are anonymous and read-only; input-size limits, content-type
validation, rate limiting and timeouts apply before parsing.

---

## Compatibility

Node 24 LTS; TypeScript 7 strict; pnpm 12; browsers (Chrome/Edge/Firefox/Safari) for the verifier
PWA and Web Component; PDF generators Puppeteer, PDFKit and Playwright; QR carrier plus pasted
payload and image upload. See
[docs/compatibility/node-browsers-generators.md](docs/compatibility/node-browsers-generators.md) and
[docs/compatibility/final-matrix.md](docs/compatibility/final-matrix.md).

---

## Documentation

| Topic | Link |
|---|---|
| Getting started | [docs/getting-started.md](docs/getting-started.md) |
| Architecture (index) | [docs/architecture/index.md](docs/architecture/index.md) |
| Data contract | [docs/architecture/data-contract.md](docs/architecture/data-contract.md) |
| Verification result | [docs/architecture/verification-result.md](docs/architecture/verification-result.md) |
| Paper Seal Profile v1 | [docs/standards/paper-seal-v1.md](docs/standards/paper-seal-v1.md) |
| PAdES conformance | [docs/architecture/pades-conformance.md](docs/architecture/pades-conformance.md) |
| Trust model & X.509/did:web | [docs/trust/index.md](docs/trust/index.md) |
| Key management & rotation | [docs/key-management/index.md](docs/key-management/index.md) |
| Lifecycle status | [docs/status/lifecycle.md](docs/status/lifecycle.md) |
| Interoperability | [docs/interop/index.md](docs/interop/index.md) |
| Deployment | [docs/deployment/docker-compose.md](docs/deployment/docker-compose.md) |
| Threat model | [docs/threat-model/index.md](docs/threat-model/index.md) |
| Security: claims vs artifact | [docs/security/claims-vs-artifact.md](docs/security/claims-vs-artifact.md) |
| Browser print security | [docs/security/browser-print.md](docs/security/browser-print.md) |
| Privacy & retention | [docs/privacy/retention.md](docs/privacy/retention.md) |
| API (OpenAPI) | [openapi/v1.yaml](openapi/v1.yaml) |
| Benchmarks | [docs/benchmarks/v1.md](docs/benchmarks/v1.md) |
| ADRs (design decisions) | [docs/adr](docs/adr) |
| Project-done checklist | [docs/project-done-checklist.md](docs/project-done-checklist.md) |

---

## Repository layout

```text
credaryn/
├── packages/      core, node, pdf, paper, verifier, web, widget
├── providers/     local, aws-kms, gcp-kms, azure-key-vault, pkcs11, shared
├── adapters/      pades-dss (Dockerized EU DSS 6.5)
├── standards/     trustvc (W3C VC / did:web / ECDSA-SD-2023)
├── services/      status (PostgreSQL lifecycle), observability
├── apps/          verifier-web, admin, playground
├── cli/           credaryn
├── examples/      invoice-puppeteer, browser-print, w3c-vc, kms examples, pdfkit, playwright
├── deploy/        Docker Compose (standard, status/admin profiles, air-gapped)
├── test-vectors/  paper-v1, pdf, providers, w3c, adversarial
└── docs/          architecture, threat-model, compatibility, deployment, adr, standards
```

---

## Development

```bash
pnpm install --frozen-lockfile
pnpm typecheck          # strict TypeScript
pnpm lint               # trust-boundary checker
pnpm test               # Vitest
pnpm test:property      # fast-check properties
pnpm test:fuzz -- --time-limit=120
pnpm test:mutation -- --changed-only
pnpm coverage           # coverage with enforced thresholds
pnpm docs:check
pnpm pades:validate:all # DSS + independent (pdfsig) validation
pnpm vectors:reproduce
```

The project is **test-first** (RED → GREEN → REFACTOR), commits golden vectors for deterministic
CBOR/COSE/Base45/QR output, and treats every security fix as regression-tested.

---

## Roadmap and project status

The planned V1 (digital + paper), V2 (enterprise providers, verifier platform, lifecycle, interop)
and V3 scope are implemented; **OCR/vision is intentionally out of scope** — if you accept
photographed documents, add OCR in your own layer, verify the seal first, and report OCR mismatch as
confidence-bearing evidence, never as cryptographic truth.

Remaining work before a stable 1.0 is **owner-run acceptance** (devices, cloud accounts, air-gapped
deployment, independent security review, release provenance). Track it in
[MANUAL-CHECKS.md](MANUAL-CHECKS.md) and [docs/project-done-checklist.md](docs/project-done-checklist.md).

Known design limits: PAdES B-T requires a configured RFC 3161 TSA; `did:web` resolution documents a
DNS-rebinding residual; package-level coverage thresholds are enforced but below the aspirational
90% target for some packages.

---

## Security policy

Report vulnerabilities privately per [SECURITY.md](SECURITY.md). Never include secrets, customer
documents or unreleased exploit details in a public issue. Threat model and assumptions:
[docs/threat-model](docs/threat-model).

---

## License

Apache-2.0 with an explicit patent grant. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

**Legal note.** Credaryn validates technical signatures. A PAdES signature, or any Credaryn result,
is **not** by itself legal proof of identity or intent. Legal qualification depends on the
certificate, trust service and jurisdiction-specific policy, and Credaryn makes no absolute or
unqualified security guarantees.

---

<p align="center"><sub>Built standards-first. Verify what the issuer actually issued — from software to paper.</sub></p>
