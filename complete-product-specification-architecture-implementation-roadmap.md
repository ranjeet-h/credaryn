# Credaryn

## Trust infrastructure for verifiable documents.

&nbsp;

Complete Product Specification, Architecture & Implementation Roadmap

Status: Complete V1, V2, V3 and end-product definition locked. Ready to begin implementation.

Working brand: Credaryn. Final trademark, domain, npm, crate and GitHub organization clearance is required before public launch.

&nbsp;

# 1\. Product Definition

&nbsp;

Credaryn is an open-source developer infrastructure layer for issuing and verifying authentic documents across digital files, browser print flows and physical paper.

&nbsp;

The problem is not that documents can be edited. PDFs, images and paper copies will always be editable. The problem is that a recipient often has no simple, independent way to determine what the real issuer originally issued and whether the visible document has been altered.

&nbsp;

Credaryn should make that verification boring for developers and obvious for recipients.

&nbsp;

## Primary positioning

Trust infrastructure for verifiable documents.

Secondary technical line: Cryptographic authenticity from software to paper.

&nbsp;

## Core product principle

Standards underneath. Simplicity on top.

&nbsp;

Credaryn is not intended to invent a new general-purpose document-signature standard. It should orchestrate established standards behind one developer API, add the missing browser-and-paper bridge, provide a universal verifier, and make deployment self-hostable.

&nbsp;

# 2\. Why This Project Still Deserves to Exist

&nbsp;

The problem is already important enough that mature standards and platforms exist for separate parts of it. That is evidence of demand, not a reason to stop. It does mean that Credaryn must avoid competing on cryptographic invention.

&nbsp;

## What already exists

PAdES provides standards-based digital signatures for PDFs.

W3C Verifiable Credentials 2.0 provides a standard model for cryptographically secured, machine-verifiable claims.

OpenAttestation/OpenCerts demonstrated document integrity, issuer identity and document-status verification; OpenAttestation is now unmaintained and TrustVC is the active interoperability path.

ISO 22376:2023 defines Visible Digital Seals for authenticity, integrity and trust on documents and objects.

&nbsp;

## The gap Credaryn should own

Existing solutions are fragmented by medium and developer workflow. A product team may need one stack for PDF signatures, another model for structured claims, another approach for paper, separate KMS integration, and separate verification UX.

&nbsp;

Credaryn should provide one developer-facing layer that can:

seal a generated PDF with a standards-compatible digital signature;

bind business-critical semantic claims to the issued document;

carry signed claims onto paper through a visible machine-readable seal;

support browser print workflows where final OS print bytes are unavailable;

verify digital files and physical-document seals through one result model;

work offline for core cryptographic checks and optionally enrich results with online status;

remain open source and self-hostable.

&nbsp;

## Build decision

Build the project, but build it as a standards-first orchestration and developer-experience layer rather than a new cryptographic island.

&nbsp;

The first major validation gate is simple: an ordinary Node developer should be able to add Credaryn to an existing document-generation flow in roughly ten lines of application code and produce a document that can be independently authenticated digitally and after printing.

&nbsp;

# 3\. Architectural Principles

&nbsp;

Use established standards wherever a mature standard already solves the security problem.

Do not create custom cryptographic algorithms.

Do not make a proprietary envelope or canonical manifest the root of trust when an established standard can represent the same proof.

Keep private signing keys on servers, KMS or HSM infrastructure. Never ship issuer private keys to browser code.

Keep core verification possible without a mandatory Credaryn cloud service.

Separate cryptographic facts from document lifecycle status and from probabilistic OCR/forensic evidence.

Treat physical-paper verification as a first-class requirement, not an afterthought.

Treat browser window.print() as a different security mode from controlled PDF generation.

Prefer interoperability and auditability over clever proprietary techniques.

Optimize the developer experience aggressively, but never hide security guarantees or limitations.

&nbsp;

# 4\. Standards-First Trust Stack

&nbsp;

## Digital PDF

Use PAdES-compatible PDF signatures with the existing CMS/PKCS\#7 and X.509 ecosystem. Credaryn should integrate with standards-compliant signing and validation implementations rather than define its own PDF signature mechanism.

&nbsp;

## Structured claims

Use W3C Verifiable Credentials 2.0 and its standard cryptographic protection mechanisms where the use case benefits from portable machine-verifiable claims. Support Data Integrity and/or JOSE/COSE profiles based on interoperability needs.

&nbsp;

## Existing verifiable-document ecosystems

Use TrustVC as the V2 interoperability path for W3C VC 2.0 and legacy OpenAttestation documents instead of building a competing credential stack. Credaryn owns document generation, paper verification, KMS integration and the unified verifier experience.

&nbsp;

## Physical documents

Align the paper seal with ISO 22376 Visible Digital Seal concepts and relevant BSI/ICAO precedents. The seal should encode or reference signed business-critical data that survives printing, photographing and scanning.

&nbsp;

## Keys and enterprise trust

Use existing PKI, enterprise trust stores, KMS/HSM providers and certificate infrastructure. Credaryn should not become a mandatory central certificate authority.

&nbsp;

# 5\. Credaryn Internal Data Model

&nbsp;

Credaryn still needs a normalized internal representation so one application API can feed multiple standards. This internal object is an orchestration model, not a new public cryptographic standard.

&nbsp;

Example logical DocumentDescriptor:

issuer: acme-retail

documentId: INV-2026-82919

documentType: invoice

issuedAt: timestamp

claims.invoiceNumber: INV-2026-82919

claims.totalMinor: 1180000

claims.currency: INR

artifactDigest: optional SHA-256 digest of the controlled final digital artifact

statusReference: optional

&nbsp;

Rules:

money values use integer minor units or canonical decimal strings, never floating point;

document ID, issuer, document type and high-value claims are explicitly bound into the signed representation;

artifact integrity and semantic claims are modeled separately because paper cannot preserve exact PDF bytes;

each standards adapter is responsible for mapping the normalized descriptor into a standards-compliant representation;

the verifier returns one normalized result even when several standards are involved.

&nbsp;

# 6\. Revised System Architecture

&nbsp;

Application

&nbsp;&nbsp;\-\> Credaryn SDK

&nbsp;&nbsp;\-\> normalized DocumentDescriptor

&nbsp;&nbsp;\-\> Signer / KMS / HSM

&nbsp;&nbsp;\-\> standards adapters

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;PDF: PAdES

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Claims: TrustVC / W3C VC interoperability path (V2)

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Paper: Visible Digital Seal / signed QR or DataMatrix

&nbsp;&nbsp;\-\> Credaryn Verify

&nbsp;&nbsp;\-\> one normalized verification result

&nbsp;

## Recommended repository shape

credaryn/

&nbsp;&nbsp;packages/

&nbsp;&nbsp;&nbsp;&nbsp;core                 orchestration types, normalized results and policy

&nbsp;&nbsp;&nbsp;&nbsp;node                 server-side SDK and signer interface

&nbsp;&nbsp;&nbsp;&nbsp;web                  browser print preparation and seal rendering

&nbsp;&nbsp;&nbsp;&nbsp;pdf                  PDF pipeline and PAdES integration

&nbsp;&nbsp;&nbsp;&nbsp;verifier             shared verification engine

&nbsp;&nbsp;&nbsp;&nbsp;react                thin React adapter, later

&nbsp;&nbsp;&nbsp;&nbsp;next                 thin Next.js adapter, later

&nbsp;&nbsp;standards/

&nbsp;&nbsp;&nbsp;&nbsp;pades                PDF signing/validation adapter

&nbsp;&nbsp;&nbsp;&nbsp;vc                   W3C Verifiable Credentials adapter

&nbsp;&nbsp;&nbsp;&nbsp;trustvc              W3C VC / legacy OpenAttestation adapter (V2)

&nbsp;&nbsp;&nbsp;&nbsp;vds                  physical-seal adapter

&nbsp;&nbsp;providers/

&nbsp;&nbsp;&nbsp;&nbsp;local                development-only local key provider

&nbsp;&nbsp;&nbsp;&nbsp;aws-kms

&nbsp;&nbsp;&nbsp;&nbsp;gcp-kms

&nbsp;&nbsp;&nbsp;&nbsp;azure-key-vault

&nbsp;&nbsp;&nbsp;&nbsp;pkcs11

&nbsp;&nbsp;apps/

&nbsp;&nbsp;&nbsp;&nbsp;verifier-web

&nbsp;&nbsp;&nbsp;&nbsp;playground

&nbsp;&nbsp;cli/

&nbsp;&nbsp;&nbsp;&nbsp;credaryn

&nbsp;&nbsp;examples/

&nbsp;&nbsp;&nbsp;&nbsp;invoice-puppeteer

&nbsp;&nbsp;&nbsp;&nbsp;invoice-pdfkit

&nbsp;&nbsp;docs/

&nbsp;&nbsp;&nbsp;&nbsp;architecture

&nbsp;&nbsp;&nbsp;&nbsp;threat-model

&nbsp;&nbsp;&nbsp;&nbsp;compatibility

&nbsp;

## Important implementation simplification

Do not make a Rust cryptographic core a V1 dependency. Start with TypeScript/Node and mature standards libraries so the first release validates product value quickly. Add Rust/WASM only when a concrete need appears, such as portable offline verification, performance, safer parsing boundaries or cross-language reuse.

&nbsp;

# 7\. Issuance Workflows

&nbsp;

## A. Controlled generated-PDF workflow

The application generates the final PDF bytes using Puppeteer, PDFKit or another supported path.

Credaryn receives the completed artifact and normalized claims.

Credaryn adds the physical seal, binds the important claims, applies the PAdES-compatible digital signature, and returns the final sealed PDF.

&nbsp;

This is the strongest mode because Credaryn controls the exact final digital artifact before distribution.

&nbsp;

## B. Browser window.print() workflow

Normal browser JavaScript does not receive the final OS printer or Save-as-PDF byte stream after window.print(). Credaryn must not pretend otherwise.

&nbsp;

For this mode, @credaryn/web prepares the page before printing:

create the signed semantic claim set;

render the signed visible seal;

add human-readable verification information;

apply print-specific CSS;

invoke or allow window.print().

&nbsp;

The printed output can still carry independently verifiable signed business data even though Credaryn cannot sign unknown post-print bytes.

&nbsp;

## C. Paper verification workflow

Scan seal \-\> decode signed claims \-\> verify issuer/signature \-\> optionally check online lifecycle status \-\> display signed values.

&nbsp;

Later, OCR can compare those signed values with visible text on the photographed or scanned document.

&nbsp;

# 8\. V1 \- Small, Standards-Based, Demo-Ready

&nbsp;

## V1 goal

Prove the cross-medium product: one small Node integration produces a digitally signed PDF and a paper-verifiable seal, and one verifier can validate both.

&nbsp;

## V1 scope

TypeScript/Node core SDK.

Normalized DocumentDescriptor and verification-result model.

Signer-provider interface with a local development provider and production-ready abstraction for KMS/HSM.

Puppeteer is the V1 controlled PDF-generation path because it maps directly from production HTML/CSS document views to PDF. PDFKit and other generators are V2 adapters.

PAdES Baseline B-B signing through a pluggable PdfSignatureEngine. The production/reference V1 engine is EU DSS 6.5 behind a Dockerized local service; B-T is enabled when an RFC 3161 TSA is configured.

Standards-aligned visible physical seal carrying signed semantic claims.

QR Code is the V1 paper carrier, error-correction level M, with DataMatrix deferred to V2 interoperability work.

Offline CLI verifier.

Dockerized web verifier.

One realistic invoice example.

Threat model.

Interoperability and tamper test suite.

Validation of signed PDFs in mainstream compatible PDF tooling.

Clear security-mode reporting for generated PDF versus window.print().

&nbsp;

## Explicitly not V1

No custom Credaryn signature protocol.

No custom general-purpose manifest/envelope standard.

No blockchain requirement.

No OCR or AI dependency.

No semi-fragile watermark.

No public registry requirement.

No mobile app.

No large framework-adapter matrix.

No Rust/WASM unless required to unblock a verified technical need.

No claim that every visible field on arbitrary paper is automatically authenticated.

&nbsp;

## V1 developer experience target

import { Credaryn } from "@credaryn/node";

&nbsp;

const credaryn \= new Credaryn({ signer });

const sealedPdf \= await credaryn.sealPdf(pdfBuffer, {

&nbsp;&nbsp;issuer: "acme-retail",

&nbsp;&nbsp;documentId: invoice.id,

&nbsp;&nbsp;documentType: "invoice",

&nbsp;&nbsp;claims: {

&nbsp;&nbsp;&nbsp;&nbsp;invoiceNumber: invoice.number,

&nbsp;&nbsp;&nbsp;&nbsp;totalMinor: invoice.totalMinor,

&nbsp;&nbsp;&nbsp;&nbsp;currency: "INR"

&nbsp;&nbsp;}

});

&nbsp;

## V1 verifier target

credaryn verify invoice.pdf

&nbsp;

## Expected normalized result:

VALID

Issuer: acme-retail

Document: INV-2026-82919

PDF signature: valid

Artifact integrity: valid

Signed total: INR 11,800

Paper seal: present and valid

Status: offline verification

&nbsp;

## V1 exit criteria

A normal Node application can integrate the primary flow in roughly ten lines of application code.

The original generated PDF verifies successfully.

A modified PDF fails digital-integrity validation.

A printed copy can expose and verify the signed business-critical claims without relying on the original PDF bytes.

Copying a valid seal onto a different example document produces an identity/claim mismatch in the verification experience.

CLI and web verifier agree on the same fixtures.

Private keys never enter browser bundles.

The verifier can run without a mandatory Credaryn-hosted service.

The repository makes no uneditable, unhackable or AI-proof claims.

&nbsp;

# 9\. V2 \- Production Integrations and Interoperability (Summary; Section 19 Is Authoritative)

&nbsp;

## Goal

Make Credaryn practical for real product teams and enterprise security environments without forcing developers to become PDF, PKI or credential-standards experts.

&nbsp;

## V2 scope

AWS KMS, Google Cloud KMS, Azure Key Vault and PKCS\#11/HSM providers.

Puppeteer, PDFKit, Playwright and selected pdf-lib-compatible integration paths.

@credaryn/web browser-print preparation.

React and Next.js adapters where they materially reduce integration effort.

W3C Verifiable Credentials adapter.

TrustVC interoperability adapter, including legacy OpenAttestation verification only where required.

Certificate-chain and trust-store configuration.

Issuer key rotation and historical verification.

Optional online document lifecycle status: ACTIVE, REVOKED, CANCELLED, SUPERSEDED, EXPIRED.

Verification REST API.

Embeddable verifier widget.

Enterprise self-hosted deployment.

Structured audit events.

Compatibility matrix and interoperability fixtures.

Performance benchmarks.

Signed supply-chain releases and SBOM.

&nbsp;

## V2 product principle

Framework and provider packages adapt into the same Credaryn orchestration model. No adapter may redefine signing semantics or create its own incompatible trust path.

&nbsp;

# 10\. V3 \- Scan, OCR and Tamper Localization

&nbsp;

V3 is deliberately separated from the cryptographic trust path.

&nbsp;

## Pipeline

photo/scan \-\> document detection \-\> perspective correction \-\> seal decode \-\> cryptographic verification \-\> layout alignment \-\> OCR \-\> signed-claim comparison \-\> optional forensic analysis \-\> report

&nbsp;

## Example result

Signature: valid

Signed total: INR 11,800

Visible OCR total: INR 81,800

Result: visible-value mismatch near invoice-total region

OCR confidence: reported separately

&nbsp;

## Rules

Cryptographic validity never depends on OCR.

OCR uncertainty can never silently become a tampered conclusion.

Probabilistic findings must include evidence and confidence.

Semi-fragile watermarking remains research-only until measured against a realistic print/scan corpus.

Watermarking ships only if it materially improves detection beyond signed-claim comparison.

&nbsp;

# 11\. Verification Trust Model

&nbsp;

## Issuer ownership

The issuer owns its signing identity and private keys.

&nbsp;

## Offline verification

Core verification uses the relevant certificate, public key, trust bundle or standard verification material. A Credaryn server must not be cryptographically required for every verification.

&nbsp;

## Optional online status

Online infrastructure may provide issuer discovery, lifecycle status, certificate/key history and richer organization metadata. This enriches the result but does not create the original issuer signature.

&nbsp;

## Enterprise mode

Organizations can run signer integrations, verifier services and any optional registry/status infrastructure inside their own network.

&nbsp;

## Public mode

Open-source projects and smaller issuers can publish trust metadata and a verification endpoint publicly while keeping private signing keys under their own control.

&nbsp;

# 12\. Threat Model

&nbsp;

## Edited PDF

Mitigation: standards-compatible PDF signature and controlled artifact validation.

&nbsp;

## Edited printed value

Mitigation: signed semantic claims in the visible seal; V3 adds OCR comparison.

&nbsp;

## Seal copied to another document

Mitigation: bind issuer, document ID, document type and high-value claims; optionally bind page/artifact references where appropriate.

&nbsp;

## Fake seal with attacker-controlled values

Mitigation: verifier rejects it unless it carries a valid trusted issuer signature.

&nbsp;

## Stolen issuer private key

Mitigation: KMS/HSM, least privilege, audit logs, key IDs, rotation and compromise/revocation procedures.

&nbsp;

## Authentic document reused after cancellation

Mitigation: optional lifecycle-status check.

&nbsp;

## Compromised Credaryn public service

Mitigation: independent offline verification and self-hosted verifier paths.

&nbsp;

## OCR mistake

Mitigation: OCR output is evidence with confidence, never cryptographic truth.

&nbsp;

## Seal removed from paper

Mitigation: result is "unverifiable", never "valid".

&nbsp;

## Malicious or buggy standards adapter

Mitigation: interoperability fixtures, independent validation tools, conformance testing and security review.

&nbsp;

# 13\. Enterprise Use Cases

&nbsp;

Bank statements and financial statements.

Insurance policies and claim documents.

Invoices, receipts and purchase orders.

Tax documents and salary slips.

Offer letters and employment certificates.

University certificates and transcripts.

Hospital and laboratory reports.

Government certificates, permits and licenses.

Property and legal-support documents where document authenticity is useful.

Shipping documents, bills of lading and logistics paperwork.

Warranty certificates and compliance reports.

Any software-generated document where a recipient must distinguish the authentic issued version from an edited copy.

&nbsp;

# 14\. Competitive Position and Moat

&nbsp;

Credaryn should not claim better cryptography than established standards or projects. Let's Seal already covers generic multi-format file authenticity and PAdES; TrustVC covers active W3C VC/OpenAttestation interoperability. Credaryn's defensible position is business-document integration: exact digital authenticity plus signed semantic claims that survive onto paper, browser-print workflows and one normalized verification experience.

&nbsp;

## Desired moat

One API across digital artifact signing, semantic claims and paper seals.

Excellent Node/TypeScript developer experience.

Reliable browser-print workflow.

One normalized verifier across multiple standards.

KMS/HSM integrations that enterprises already trust.

Self-hosted deployment and no mandatory central service.

Interoperability test suite and public threat model.

Recognizable verification mark on issued documents.

A strong ecosystem of framework and document-generation adapters.

Credibility earned through standards compatibility instead of proprietary cryptographic tricks.

&nbsp;

# 15\. Open-Source Strategy

&nbsp;

Open source from the beginning.

License is Apache-2.0 for V1 and later, giving enterprise-friendly permissive use with an explicit patent grant. Keep LICENSE and NOTICE correct in every distribution.

Keep verifier, CLI, SDKs and self-hosted deployment open.

Document every standards mapping and security assumption.

Publish official interoperability fixtures instead of proprietary black-box test vectors.

Accept third-party adapters and language SDKs.

TypeScript/Node is first-class initially; Python, Java, Go and Rust follow demonstrated demand or technical need.

Publish SECURITY.md, private vulnerability reporting, dependency policy and release-signing process.

&nbsp;

# 16\. Adoption and Launch Plan

&nbsp;

## Primary launch demo

Generate an invoice with total INR 11,800.

Seal it with Credaryn.

Show the PDF validating digitally.

Print it and scan the Credaryn seal to show the signed total.

Edit the visible PDF or photographed value to INR 81,800.

Show the altered digital file failing integrity validation.

Show the signed paper claim still reporting INR 11,800.

Later, show OCR reporting the visible INR 81,800 versus signed INR 11,800 mismatch.

&nbsp;

## README opening

Documents are easy to edit. Credaryn makes authentic issuance independently verifiable \- from software to paper.

&nbsp;

## Adoption flywheel

Developers integrate a small SDK.

Documents expose a small "Verify with Credaryn" mark and machine-readable seal where appropriate.

Recipients naturally encounter the verifier.

Developers and security teams discover the open-source project.

More integrations increase the number of verifiable documents.

The verification mark becomes recognizable.

&nbsp;

## Distribution

GitHub launch with excellent README and runnable demo.

Show HN.

Developer and security communities.

Technical article: why PDF signatures, verifiable credentials and paper seals solve different parts of the same problem.

Short demo videos on LinkedIn and X.

Security-community review after threat-model publication.

Enterprise/security outreach only after interoperability and self-hosting are credible.

&nbsp;

# 17\. Production Release Requirements

&nbsp;

Independent security review of implementation boundaries and adapter composition.

PAdES interoperability validation with mainstream tooling.

TrustVC/W3C VC interoperability fixtures for the supported V2 profile, including legacy OpenAttestation fixtures only where compatibility is promised.

VDS conformance review for the physical-seal profile we actually implement.

Fuzz testing of parsers, QR/DataMatrix decoders and untrusted verifier inputs.

Key-compromise, rotation and lifecycle-status documentation.

Supply-chain hardening, signed releases and SBOM.

Dependency auditing and CVE response process.

Docker hardening guide.

KMS/HSM deployment guide.

Compatibility matrix for Node, browsers and supported document-generation libraries.

Performance benchmarks.

Versioning and migration policy.

Privacy documentation for any optional hosted or registry components.

&nbsp;

# 18\. Implementation Baseline \- Locked

# 

# This section is authoritative for V1 implementation. If an older section conflicts with it, this section wins until an explicit ADR changes the decision.

# 

## Product boundary

# Credaryn V1 is not a generic file-sealing platform, timestamping network, e-signature workflow, certificate authority, blockchain proof system or multi-format authenticity product. V1 supports business documents that begin as software-generated PDF/HTML and must remain verifiable after printing. The differentiated product is the bridge between exact digital authenticity, signed business claims and physical-paper verification.

# 

## Runtime and repository toolchain

# Runtime baseline: Node.js 24 LTS.

# Language: TypeScript 7 with strict mode and no implicit any.

# Package manager: pnpm 12 workspaces with one lockfile.

# Build approach: pnpm workspace scripts first; do not add Turborepo until repository scale proves it useful.

# Unit/integration tests: Vitest 5\.

# Browser/E2E tests: Playwright.

# Property-based tests: fast-check for descriptor validation, deterministic encoding and parser invariants.

# Versioning/release management: Changesets with semantic versioning.

# CI: GitHub Actions on Node 24, with locked dependency installation.

# Dependency updates: Renovate weekly; security updates may bypass the weekly window.

# 

## V1 repository structure

# credaryn/

# &nbsp;&nbsp;packages/

# &nbsp;&nbsp;&nbsp;&nbsp;core/          @credaryn/core \- types, validation, policy, verdict model

# &nbsp;&nbsp;&nbsp;&nbsp;node/          @credaryn/node \- primary server SDK and orchestration

# &nbsp;&nbsp;&nbsp;&nbsp;pdf/           @credaryn/pdf \- PDF preparation and PAdES engine interface

# &nbsp;&nbsp;&nbsp;&nbsp;paper/         @credaryn/paper \- Paper Seal Profile v1 encode/render/decode/verify

# &nbsp;&nbsp;&nbsp;&nbsp;verifier/      @credaryn/verifier \- normalized verification engine

# &nbsp;&nbsp;adapters/

# &nbsp;&nbsp;&nbsp;&nbsp;pades-dss/     Dockerized EU DSS 6.5 production/reference adapter

# &nbsp;&nbsp;&nbsp;&nbsp;trustvc/       V2 only

# &nbsp;&nbsp;apps/

# &nbsp;&nbsp;&nbsp;&nbsp;verifier-web/

# &nbsp;&nbsp;&nbsp;&nbsp;playground/

# &nbsp;&nbsp;cli/

# &nbsp;&nbsp;&nbsp;&nbsp;credaryn/

# &nbsp;&nbsp;examples/

# &nbsp;&nbsp;&nbsp;&nbsp;invoice-puppeteer/

# &nbsp;&nbsp;test-vectors/

# &nbsp;&nbsp;&nbsp;&nbsp;paper-v1/

# &nbsp;&nbsp;&nbsp;&nbsp;pdf/

# &nbsp;&nbsp;docs/

# &nbsp;&nbsp;&nbsp;&nbsp;adr/

# &nbsp;&nbsp;&nbsp;&nbsp;architecture/

# &nbsp;&nbsp;&nbsp;&nbsp;threat-model/

# &nbsp;&nbsp;&nbsp;&nbsp;compatibility/

# 

## Public data contract

# DocumentDescriptor is the single application-facing description of what is being issued. It is an internal orchestration contract, not a new cryptographic standard.

# Required fields: issuerId, documentId, documentType, issuedAt, claims.

# issuedAt is RFC 3339 in the TypeScript API and may be encoded as epoch seconds in compact paper payloads.

# claims is a flat map in V1. Allowed values are string, boolean and safe integer. Floating-point values are rejected.

# Money is always represented as integer minor units plus an explicit ISO currency code.

# Arrays, arbitrary nested objects and binary values are not supported in V1 claims because they harm interoperability and QR size predictability.

# statusUrl is optional and must use HTTPS when present outside local development.

# artifactDigest is generated by the digital-artifact pipeline; callers do not manually provide it for the primary sealPdf flow.

# 

## Signing provider contract

# The application never handles raw private-key bytes through Credaryn APIs in production.

# SignerProvider exposes key identity, algorithm metadata, certificate material when relevant, and an asynchronous sign operation.

# Paper Seal Profile v1 requires ES256 using P-256 and SHA-256.

# The PDF engine may support enterprise RSA or ECDSA certificates where the selected PAdES engine supports them, but the recommended new Credaryn issuer certificate is P-256 so one enterprise identity can serve both paths.

# Local development keys are generated only by explicit development tooling and must be clearly marked as untrusted outside the demo trust store.

# 

## PAdES profile and engine

# V1 target: PAdES Baseline B-B for every production-capable PDF signature.

# V1 optional upgrade: PAdES Baseline B-T when an RFC 3161 trusted timestamp authority is configured.

# V2 enterprise target: B-LT and later B-LTA where long-term archival validation is required.

# Production/reference engine: European Commission Digital Signature Service (DSS) 6.5, isolated behind the PdfSignatureEngine interface and packaged as a Dockerized local/self-hosted adapter.

# Credaryn Node packages must not expose DSS or Java types. The boundary is bytes plus normalized signing/validation requests and results.

# Every PDF fixture produced by Credaryn CI must be validated by DSS. A second independent PAdES-capable validator should be added before 1.0 to reduce implementation monoculture.

# A future Node-native engine may replace the DSS runtime for simpler deployments only after it passes the same conformance fixtures and independent validation. Do not weaken PAdES conformance merely to remove the sidecar.

# Credaryn must never claim that a PAdES signature is a qualified electronic signature merely because it uses the PAdES format; legal qualification depends on the certificate, trust service and policy environment.

# 

## Credaryn Paper Seal Profile v1

# Purpose: carry a small set of signed business-critical claims onto paper so the claims remain independently checkable after PDF bytes are lost through printing/scanning.

# Carrier: QR Code only in V1. DataMatrix is a V2 compatibility option.

# QR error correction: M by default.

# Transport prefix: CRD1: followed by Base45 encoded payload bytes.

# Transport encoding: Base45 as defined by RFC 9285\.

# Signed container: COSE\_Sign1 as defined by RFC 9052\.

# Signature algorithm: ES256, meaning ECDSA P-256 with SHA-256.

# Payload serialization: deterministic CBOR using RFC 8949 deterministic encoding rules.

# Maximum V1 COSE object size before Base45 transport: 1200 bytes. Encoding must fail closed when this limit is exceeded; developers must reduce claims rather than silently drop fields.

# Default payload fields: version, issuerId, keyId/certificate thumbprint, documentId, documentType, issuedAt and claims.

# Optional payload fields: compact status reference and digitalArtifactDigest when explicitly useful for linking the paper copy to a digital artifact.

# The full source document, personal notes and unnecessary PII must not be placed in the QR. Only claims required for verification should be signed into the paper payload.

# The paper seal is ISO 22376 VDS-informed and uses standard cryptographic primitives, but Credaryn must not claim ISO 22376 conformance until the final implemented profile is reviewed against the complete standard and conformance expectations.

# 

## Paper trust resolution

# The QR does not embed a global Credaryn trust claim.

# V1 offline enterprise mode: verifier receives a configured trust bundle that maps issuer/key identifiers or certificate fingerprints to trusted certificate chains/public keys.

# V1 demo mode: the repository ships a demo-only root/trust bundle and labels it as non-production.

# Public mode: a verifier may resolve issuer trust metadata over HTTPS and cache it for later verification. Network failure must not convert unknown trust into trusted status.

# Credaryn will not operate a mandatory global root CA in V1 or V2.

# 

## Verification result model

# Cryptographic validity and issuer trust are separate dimensions.

# Top-level verdicts are: VALID\_TRUSTED, VALID\_UNTRUSTED, INVALID and UNVERIFIABLE.

# VALID\_TRUSTED means the signature/integrity checks required by the current mode pass and the issuer chains to a configured trusted identity.

# VALID\_UNTRUSTED means the cryptographic signature is internally valid but the issuer is not trusted by the current trust configuration. The UI must never label this as authentic.

# INVALID means a signature, integrity check or signed-claim binding failed.

# UNVERIFIABLE means required evidence is missing, unsupported or cannot currently be resolved.

# Lifecycle status is a separate field: ACTIVE, REVOKED, CANCELLED, SUPERSEDED, EXPIRED or UNCHECKED.

# OCR findings are a separate evidence field and never change cryptographic validity directly.

# Generated-PDF mode and browser-print mode must always be visible in the result because they provide different guarantees.

# 

## V1 PDF generation decision

# Puppeteer is the first and only required PDF generator integration for V1. It best demonstrates the real web-product workflow: render existing HTML/CSS invoice UI, produce PDF bytes, add the paper seal, then apply PAdES.

# PDFKit, Playwright PDF generation and pdf-lib integration are V2/adoption-driven adapters.

# The example invoice application is the reference integration and must remain small enough that the core Credaryn application code is roughly ten lines.

# 

## Primary SDK API

# The V1 public surface should be small:

# new Credaryn({ pdfEngine, paperSigner, trustStore })

# credaryn.sealPdf(pdfBytes, descriptor, options)

# credaryn.verifyPdf(pdfBytes, options)

# credaryn.createPaperSeal(descriptor)

# credaryn.verifyPaperSeal(payload, options)

# 

# Framework packages must call these APIs rather than reimplement security logic. V1 does not ship React or Next.js wrappers until the core API proves stable.

# 

## CLI contract

# credaryn seal pdf input.pdf \--descriptor invoice.json \--out sealed.pdf

# credaryn verify sealed.pdf \--trust ./trust

# credaryn paper inspect \<payload-or-image\>

# credaryn key inspect cert.pem

# credaryn dev-ca init

# The dev-ca command is development-only and its generated trust material must never be described as production trust.

# 

## V1 interoperability scope

# W3C Verifiable Credentials are not required for V1. Adding them before the PDF-paper proof would dilute the core differentiation.

# V2 uses TrustVC as the primary interoperability library.

# Production W3C issuer identity: did:web.

# Development/testing may use did:key.

# First V2 W3C cryptosuite: ECDSA-SD-2023. BBS-2023 is deferred until a concrete selective-disclosure need exists.

# Legacy OpenAttestation documents are supported through TrustVC compatibility only where adoption/customer demand justifies it.

# No TradeTrust blockchain dependency belongs in Credaryn core.

# 

## Testing and acceptance gates

# TDD is mandatory: RED \-\> GREEN \-\> REFACTOR for every behavior added to core, paper, PDF and verifier packages.

# Unit coverage target: at least 90% for core/paper/verifier packages and 100% branch coverage for security-critical validation and verdict code where practical.

# Every security fix requires a regression test before the fix is merged.

# Golden test vectors are committed for deterministic CBOR bytes, COSE signatures, Base45 payloads and complete QR text.

# Mutation tests must cover changed documentId, issuerId, claim value, COSE byte, key identifier, certificate fingerprint and post-signing PDF byte changes.

# Property tests must prove encode/decode determinism and rejection of floating-point, oversized and structurally invalid descriptors.

# PDF CI gate: every generated fixture validates through DSS 6.5 at the claimed PAdES level.

# Paper CI gate: encode \-\> render \-\> decode \-\> verify round trips across multiple QR sizes and representative claim payloads.

# Browser E2E uses Playwright only after the browser-print package begins.

# Before V1 beta, manually test at least two real printers, two phone cameras and one scanner. Record results as a small public compatibility corpus rather than claiming universal print/scan robustness.

# 

## Phase execution and manual checkpoints

# Implementation is sequential and phase-gated. The coding agent must not implement later phases while a current phase is failing.

# Each phase requires: written acceptance criteria, failing tests first, implementation, automated quality gates, a short manual test procedure, and an explicit stop for user verification before the next major feature phase.

# Manual checkpoints are mandatory after: Paper Seal Profile proof, PAdES PDF proof, unified verifier, launch demo, browser-print path and each production key-provider integration.

# The manual test section must say exactly what command/page to open, what action to perform and what successful/failed result should look like.

# 

## Security and release gates

# No private keys in frontend bundles, logs, fixtures or repository history.

# No network dependency in basic cryptographic verification when all required trust material is locally available.

# All untrusted PDF, QR, CBOR, COSE and certificate inputs have explicit size limits before deep parsing.

# Parsers fail closed on unknown critical fields/algorithms.

# Algorithm agility is versioned; V1 accepts only explicitly supported algorithms rather than negotiating arbitrary algorithm identifiers.

# Use Apache-2.0.

# Publish SECURITY.md before public beta.

# Enable GitHub private vulnerability reporting.

# Generate an SBOM for releases.

# Use npm provenance/trusted publishing when publishing npm packages.

# Sign/tag GitHub releases and keep release automation OIDC-based where possible instead of storing long-lived publishing tokens.

# Do not publish 1.0 until the threat model, interoperability matrix and independent security review are complete.

# 

## Competitive boundary

# Let's Seal already covers generic multi-format file authenticity, PAdES, issuer certificates, timestamps, transparency and a general verifier. Credaryn must not clone that scope.

# Credaryn wins only if it makes business documents verifiable across digital PDF and physical paper, binds human-meaningful claims, supports browser printing, and gives developers one normalized verification result.

# Where an established project already provides a stronger standards implementation, prefer interoperability or an adapter over rebuilding it.

# 

## V1 success gate

# The project continues beyond the first public beta only if all of the following are true:

# 1\. A developer can integrate the reference Node flow with roughly ten lines of application code after infrastructure setup.

# 2\. A Credaryn PDF validates as PAdES in independent tooling.

# 3\. The same issued document can be printed and its signed critical claims verified from the QR without access to the original PDF bytes.

# 4\. Editing the PDF after signing fails digital verification.

# 5\. Replacing a visible paper value cannot alter the signed value reported by the seal.

# 6\. The verifier clearly distinguishes valid/trusted, valid/untrusted, invalid and unverifiable.

# 7\. The demo is understandable without first teaching the viewer PAdES, COSE or CBOR.

# 8\. Credaryn remains meaningfully differentiated from generic file-sealing and credential projects.

# 

# 19\. V2 Implementation Baseline \- Locked

# 

# This section defines the enterprise-production phase. V2 is not a rewrite of V1; every V2 component must preserve the V1 trust model, paper profile and normalized verification result.

# 

# V2 goal

# Make Credaryn production-ready for banks, insurers, healthcare, government, SaaS and other enterprise issuers without requiring product teams to understand PKI, PAdES, COSE, QR internals or W3C credential standards.

# 

# V2 package and service additions

# packages/web           @credaryn/web \- browser print preparation and paper-seal placement

# packages/widget        @credaryn/widget \- framework-neutral verifier Web Component

# packages/react         @credaryn/react \- thin optional React helpers only after the Web Component is stable

# packages/next          @credaryn/next \- thin Next.js server helpers only where they remove real integration work

# providers/aws-kms      @credaryn/aws-kms

# providers/gcp-kms      @credaryn/gcp-kms

# providers/azure-kv     @credaryn/azure-key-vault

# providers/pkcs11       isolated PKCS\#11/HSM signer adapter

# standards/trustvc      TrustVC/W3C VC interoperability

# services/status        optional document lifecycle-status service

# apps/verifier-web      public/self-hosted verifier PWA

# apps/admin             optional issuer/status administration console

# examples/browser-print

# examples/aws-kms

# examples/w3c-vc

# 

## Cloud key-provider decisions

# All first-party cloud providers use P-256 / SHA-256 for the Credaryn paper-signing path so the same algorithm family works across AWS, Google Cloud and Azure.

# AWS KMS: ECC\_NIST\_P256 with ECDSA\_SHA\_256 through the official AWS SDK. Convert AWS DER-encoded ECDSA signatures to the fixed-width COSE ES256 representation only inside the provider adapter and test that conversion with golden vectors.

# Google Cloud KMS: EC\_SIGN\_P256\_SHA256 through the official Google Cloud SDK. SOFTWARE and HSM protection levels are both supported; production guidance recommends HSM when the issuer's risk/compliance profile requires it.

# Azure Key Vault / Managed HSM: P-256 with ES256 through the official Azure SDK. Managed HSM is the enterprise recommendation where dedicated HSM protection is required.

# PKCS\#11: production HSM access is isolated behind the SignerProvider boundary and tested against SoftHSM2 in CI. Do not make a low-level Node PKCS\#11 package part of Credaryn core. Vendor HSM certification is documented per supported device before it is listed as production-compatible.

# Cloud provider adapters must expose public-key/certificate retrieval, key version identity, signing, health checks and normalized provider errors. They must never export private key material.

# 

# Key lifecycle and rotation

# issuerId is stable across key rotations.

# Every signing key has an immutable keyId/version.

# Only the ACTIVE key signs new documents.

# RETIRED keys remain available for historical verification.

# REVOKED/COMPROMISED keys remain discoverable with compromise metadata so old signatures can be evaluated according to signing time and policy; they are never silently deleted from trust history.

# Rotation must support overlap: publish/authorize the new verification key before it becomes the active signer.

# Verification results expose keyId, trust source and key lifecycle state.

# Deletion of historical public verification material is prohibited while documents signed by that key remain within the issuer's verification-retention period.

# 

# Issuer identity and trust discovery

# Credaryn supports two first-class issuer identity modes:

# 1\. X.509 / enterprise trust-bundle mode for managed enterprise environments and offline verification.

# 2\. did:web mode for public web-domain identity and W3C interoperability.

# Credaryn does not require or operate a mandatory global CA or blockchain.

# A fetched key is not automatically trusted merely because it was fetched successfully. The verifier's TrustPolicy decides whether an enterprise root, configured public key/certificate, or domain-controlled did:web identity is sufficient for VALID\_TRUSTED.

# Verifier output includes trust method such as ENTERPRISE\_ANCHOR, X509\_CHAIN, DID\_WEB\_DOMAIN or UNCONFIGURED.

# For did:web, resolution uses HTTPS and may be cached. Offline use of cached did:web material reports cache age; expired/unavailable metadata must not silently become trusted.

# 

## Browser printing architecture

# Browser JavaScript still never receives final OS print bytes, so browser printing remains a paper-claims security mode rather than a digitally signed PDF mode.

# @credaryn/web provides explicit preparePrint() and prepareAndPrint() APIs. It must not monkey-patch global window.print() by default.

# The browser sends the DocumentDescriptor to a trusted server endpoint owned by the integrating application. The server uses @credaryn/node and the configured SignerProvider to create the signed paper seal. The private key never enters the browser.

# The page contains an explicit placement target such as \<credaryn-seal\> or an element marked data-credaryn-seal. The web package injects the rendered QR and human-readable verification text into that target and applies print CSS.

# The browser package displays/returns securityMode=PAPER\_CLAIMS\_ONLY. It must never claim DIGITAL\_ARTIFACT\_SIGNED unless the application generated and signed a controlled PDF through the server-side PDF flow.

# Before invoking print, prepareAndPrint() must finish seal issuance and rendering; failure aborts printing unless the developer explicitly handles a fallback.

# CSP-friendly rendering, no eval/new Function, and no third-party network calls are required.

# 

# Additional document-generation adapters

# V2 adds PDFKit and Playwright adapters after the Puppeteer reference path is stable.

# pdf-lib may be used for safe PDF manipulation where appropriate, but it is not itself the trust/signature engine.

# Each adapter must converge into the same sealPdf/document pipeline; adapters cannot invent independent signature semantics.

# Adapter support is accepted only with fixtures proving that paper seal placement occurs before final PAdES signing and that post-signing mutation is detected.

# 

## Unified verifier product

# The verifier has one core engine and three delivery surfaces: library, CLI and web/PWA.

# The web verifier supports PDF upload, camera QR scan, image upload and pasted CRD1 payload.

# Camera QR decoding happens client-side where practical. Verification can be entirely local when trust material is already available.

# The verifier PWA may cache static application assets and explicitly configured trust material for offline enterprise use. It must not cache uploaded customer documents by default.

# Verification history is OFF by default. If enabled by an operator, retention and privacy settings must be explicit.

# The normalized result must show separate cards/fields for: cryptographic validity, issuer trust, digital artifact integrity, signed claims, lifecycle status, security mode and later OCR evidence.

# The embeddable verifier is implemented first as a standards-based Web Component in @credaryn/widget. React/other wrappers only delegate to this component/API.

# 

# Verification REST API

# The self-hosted verifier exposes a versioned API:

# POST /v1/verify/pdf              multipart PDF \-\> normalized VerificationResult

# POST /v1/verify/paper            CRD1 payload or image \-\> normalized VerificationResult

# POST /v1/verify                  auto-detect supported input when unambiguous

# GET  /v1/health                  liveness/readiness metadata

# GET  /v1/version                 build/version/compatibility metadata

# No verification endpoint requires a Credaryn cloud account in self-hosted mode.

# Public deployments apply input-size limits, content-type validation, rate limiting and request timeouts before expensive parsing.

# Uploaded bytes are processed ephemerally and deleted after the request unless the deployment explicitly enables retention.

# 

# Document lifecycle status

# Lifecycle status is operational state, separate from the immutable issuance signature.

# Credaryn-native documents use an optional HTTPS status URL/reference. The canonical states remain ACTIVE, REVOKED, CANCELLED, SUPERSEDED and EXPIRED.

# Status responses also include updatedAt and an optional reason code suitable for machine processing; human free-text is optional and must not be required for verification.

# An unavailable status service results in status=UNCHECKED/UNAVAILABLE according to freshness policy; it never invalidates an otherwise valid historical signature unless the caller's TrustPolicy explicitly requires a fresh status check.

# The optional self-hosted status service uses PostgreSQL as durable storage. Redis is not a required dependency; add it only if measured load requires caching/queues.

# The service keeps append-only status history/audit events in addition to the current status projection.

# For W3C Verifiable Credentials, use the W3C Bitstring Status List v1.0 rather than the Credaryn-native status endpoint.

# 

# W3C/TrustVC interoperability

# W3C VC functionality remains optional and isolated from the core document path.

# V2 implementation uses TrustVC.

# Issuer identifier: did:web for production; did:key only for local tests/examples.

# First cryptosuite: ECDSA-SD-2023. It is based on a W3C Recommendation cryptosuite and provides selective disclosure while staying aligned with the P-256 strategy.

# BBS-2023 is not a required V2 feature because it remains less mature than the ECDSA Recommendation path; add it only after standard maturity and real demand justify another suite.

# Credential lifecycle status uses W3C Bitstring Status List v1.0.

# Legacy OpenAttestation verification is compatibility-only through TrustVC; Credaryn does not create a new OpenAttestation-first issuance path.

# No TradeTrust/blockchain dependency enters Credaryn core.

# 

# Optional status/admin service authentication

# Public verification endpoints are anonymous/read-only.

# Issuer administration uses OIDC/OAuth2 with enterprise identity providers rather than Credaryn-owned passwords where possible.

# Machine-to-machine administration supports workload identity or short-lived OAuth2 credentials. Long-lived static API keys are a compatibility fallback, not the preferred enterprise mechanism.

# Any optional remote signing service requires authenticated workload identity and least-privilege authorization to a specific issuer/key. It must never become an unauthenticated generic signing endpoint.

# 

# Audit and observability

# All services emit structured JSON logs with correlation IDs and OpenTelemetry traces/metrics.

# Never log private keys, raw signature preimages when they contain sensitive claims, entire uploaded documents, authorization tokens or unnecessary PII.

# Security-significant events include signing request accepted/rejected, key version used, status changed, trust configuration changed, verification parser rejection and administrative access.

# Audit exports support stdout/file/OpenTelemetry collector targets so enterprises can feed their SIEM without proprietary Credaryn infrastructure.

# 

# Self-hosted deployment

# V2 ships a production-oriented Docker Compose reference deployment containing verifier-web/API, DSS PAdES adapter and optional status/admin components. PostgreSQL is included only when status/admin is enabled.

# A Kubernetes/Helm deployment is added only after the Docker Compose deployment is stable; Helm is an enterprise deployment surface, not a separate product architecture.

# All services support environment-variable/secret-file configuration and read-only filesystem operation where practical.

# Containers run as non-root, expose health checks, use pinned base-image digests in release builds and document outbound network requirements.

# Air-gapped mode supports PDF/paper verification with local trust bundles and no status freshness guarantee.

# 

# V2 security gates

# Threat-model update covering KMS/HSM, did:web resolution, status service, browser printing and verifier API.

# Cloud-provider integration tests use provider emulators/mocks where available plus scheduled real-provider smoke tests without putting long-lived credentials in CI.

# Key-rotation fixtures prove documents signed by old keys remain verifiable after rotation.

# SSRF protections apply to any verifier feature that resolves remote trust/status URLs; only HTTPS, explicit redirects policy, DNS/IP filtering and bounded response sizes are allowed.

# ZIP/decompression bombs, oversized PDFs/images, malformed CBOR/COSE/certificates and image decoder abuse are part of adversarial tests.

# Admin/status components require CSRF protection where browser sessions exist, secure cookies and strict CORS.

# 

## V2 acceptance criteria

# 1\. AWS KMS, Google Cloud KMS and Azure Key Vault can issue the same Paper Seal Profile v1 semantics with ES256 and pass shared vectors.

# 2\. A documented PKCS\#11/SoftHSM2 path passes integration tests, with production HSM support listed only after vendor/device validation.

# 3\. Browser prepareAndPrint() produces a paper-verifiable document without exposing the signing key or claiming PDF-byte integrity.

# 4\. Puppeteer, PDFKit and Playwright supported paths produce PAdES-valid documents using the same verifier model.

# 5\. Key rotation preserves historical verification.

# 6\. Optional lifecycle status distinguishes immutable authenticity from current document state.

# 7\. TrustVC/did:web/ECDSA-SD-2023 issuance and verification pass published interoperability fixtures.

# 8\. W3C credential status uses Bitstring Status List v1.0.

# 9\. Docker Compose self-host deployment runs verifier plus optional status/admin with no Credaryn-hosted dependency.

# 10\. Web, CLI and REST API produce semantically equivalent VerificationResult output for the same evidence.

# 

# 20\. V3 Physical Document Intelligence \- Locked

# 

# V3 adds scan/photo understanding after cryptographic verification. It is evidence analysis, never the root of trust.

# 

# V3 goal

# When a user photographs or scans a paper document, Credaryn should first verify the cryptographic paper seal, then compare signed critical claims with what is visibly printed and explain any mismatch with evidence and confidence.

# 

## V3 service architecture

# V3 runs as an optional OCR/vision sidecar so the core Node verifier remains lightweight and deployable without ML dependencies.

# Reference implementation language: Python.

# Default OCR engine: PaddleOCR PP-OCRv6 medium for printed-document text recognition.

# Document preprocessing/layout: PaddleOCR document preprocessing and PP-StructureV3 where layout/region information improves claim localization; enable orientation correction/unwarping when needed by the scan pipeline.

# Image processing utilities may use OpenCV for deterministic crop/geometry operations that are not already provided by the Paddle pipeline.

# The OCR service is self-hostable and receives only the image/page required for analysis. No external AI API is required.

# GPU is optional; CPU operation remains supported for low-volume/self-hosted deployments.

# 

## V3 scan pipeline

# input image/photo \-\> input limits \-\> QR locate/decode \-\> cryptographic Paper Seal verification \-\> orientation/perspective correction \-\> OCR/layout \-\> claim localization \-\> deterministic normalization \-\> signed-vs-visible comparison \-\> evidence report.

# If the QR cannot be verified, OCR may still run for diagnostics but the result is not an authenticity determination.

# If cryptographic verification succeeds but a visible claim cannot be confidently located, result is INCONCLUSIVE rather than TAMPERED.

# 

## Extraction profiles

# V3 introduces an optional ExtractionProfile per document type/template. This is locator configuration, not signed truth.

# An ExtractionProfile can define claim key, data type, expected nearby labels, optional normalized page region, formatting hints and comparison normalization rules.

# For controlled HTML templates, developers may mark DOM elements with data-credaryn-claim attributes so example/profile generation can capture stable claim locations without hard-coding OCR heuristics.

# The signed claim value remains authoritative; extraction configuration only helps find the visible representation.

# If no profile exists, Credaryn may use conservative label/value search and return lower-confidence evidence.

# 

# Visible comparison model

# Per signed claim, V3 returns one of MATCH, MISMATCH, NOT\_FOUND or UNCERTAIN.

# Each finding includes signed value, visible/OCR value when present, page/region evidence, OCR confidence, normalization applied and extraction method.

# Document-level visibleContentAssessment is CONSISTENT, POSSIBLE\_MISMATCH or INCONCLUSIVE.

# POSSIBLE\_MISMATCH never overwrites a VALID\_TRUSTED cryptographic verdict; the UI shows both facts: the seal/signature is valid, while the visible paper appears inconsistent with one or more signed claims.

# 

# Normalization rules

# Currency/money comparisons operate on minor units after locale-aware symbol/separator normalization.

# Dates normalize to an explicit declared format/timezone policy rather than guessing ambiguous day/month order.

# Identifiers remove only configured presentation separators; arbitrary fuzzy matching is prohibited for security-critical identifiers.

# Whitespace/case normalization is allowed for explicitly configured text claims.

# OCR edit-distance/fuzzy similarity may be shown as evidence but cannot convert a materially different numeric/identifier claim into MATCH.

# 

# OCR confidence policy

# Each OCR engine/model version is recorded in the evidence result.

# Low confidence causes UNCERTAIN rather than MISMATCH unless multiple independent deterministic signals establish the difference.

# Thresholds are calibrated from the project scan corpus and versioned with the ExtractionProfile/OCR policy; they are not hidden magic constants.

# The UI exposes confidence/evidence for every probabilistic finding.

# 

# V3 privacy

# OCR runs locally/self-hosted by default.

# Images are ephemeral by default and are not retained for model training.

# Telemetry records timing/model/error classes, not raw page images or extracted sensitive text unless an operator explicitly enables a compliant diagnostic mode.

# Any future hosted OCR offering must have separate retention/region/compliance controls and is not required for the open-source end product.

# 

# V3 corpus and quality gates

# Maintain a public non-sensitive compatibility corpus plus private/synthetic test corpus covering direct PDF rasterization, office printers, laser/inkjet output, phone photos, skew, perspective, shadows, JPEG compression, grayscale, moderate blur and multiple QR sizes.

# Create controlled tamper cases for numeric totals, dates, IDs and short text fields.

# Measure QR decode rate, claim-location rate, OCR exact/normalized accuracy, benign-document false mismatch rate and tamper-detection recall separately.

# Do not publish universal accuracy claims. Publish results by document template/profile and capture conditions.

# A release cannot regress the benign false-mismatch rate or tamper recall beyond an explicitly approved tolerance without a major/minor release note and model-policy update.

# 

# Watermark decision

# Semi-fragile/invisible watermarking remains an experimental plugin, not a requirement for Credaryn completion.

# It ships only if controlled evaluation shows meaningful localization/detection value beyond signed-claim OCR comparison under real print/scan transformations and with an acceptable false-positive rate.

# No marketing claim may imply an invisible watermark is cryptographic proof.

# 

## V3 acceptance criteria

# 1\. Camera/photo verification always performs cryptographic verification before visible-content assessment.

# 2\. For profiled sample documents, signed fields can be located and compared with page-region evidence.

# 3\. A changed critical numeric value is reported as POSSIBLE\_MISMATCH with both signed and visible values when OCR confidence is sufficient.

# 4\. Benign print/scan degradation produces UNCERTAIN rather than false tamper conclusions when evidence is weak.

# 5\. The OCR service can run fully self-hosted without sending document content to third parties.

# 6\. OCR/model version, extraction profile version and confidence policy are recorded in evidence.

# 7\. The project publishes measured corpus results rather than unsupported universal accuracy percentages.

# 

# 21\. Final End Product Definition and Project Done Criteria

# 

# This section defines the destination. Once these criteria are met, Credaryn is considered feature-complete for the planned project and future work becomes normal product evolution rather than an unfinished original scope.

# 

## Final product promise

# Credaryn is open-source trust infrastructure that lets an application issue a business document once and preserve independently verifiable authenticity across controlled digital PDF and physical paper, while optionally comparing a scanned paper copy's visible critical values against the signed values.

# 

# Final user journeys

# Issuer developer: install the Node SDK, connect a local/KMS/HSM signer, describe critical claims, generate/seal the document and ship it.

# Recipient with PDF: upload/open through Credaryn verifier or call SDK/API \-\> see digital signature/integrity, issuer trust, signed claims and current lifecycle status.

# Recipient with paper: scan QR \-\> see issuer trust, signed claims and lifecycle status without the original PDF.

# Recipient with photographed paper in V3: scan/photo \-\> cryptographic result first \-\> visible signed-claim comparison second.

# Enterprise administrator: configure trust roots/did:web policy, KMS/HSM keys, key rotation, optional status service, OIDC, retention and audit export.

# Security auditor: reproduce test vectors, verify documents independently, inspect threat model and run the system without a Credaryn-hosted dependency.

# 

## Final product surfaces

# 1\. @credaryn/core \- contracts, validation, trust/verdict policy.

# 2\. @credaryn/node \- primary issuance/orchestration SDK.

# 3\. @credaryn/pdf \- PDF pipeline/PAdES engine abstraction.

# 4\. @credaryn/paper \- Paper Seal Profile v1.

# 5\. @credaryn/verifier \- shared verification engine.

# 6\. @credaryn/web \- browser print integration.

# 7\. @credaryn/widget \- embeddable verifier Web Component.

# 8\. Cloud signer providers for AWS KMS, Google Cloud KMS and Azure Key Vault.

# 9\. PKCS\#11/HSM adapter boundary with validated reference/testing path.

# 10\. TrustVC/W3C VC interoperability package.

# 11\. credaryn CLI.

# 12\. verifier-web PWA.

# 13\. optional status service and admin UI.

# 14\. Docker Compose self-host bundle; Kubernetes/Helm enterprise deployment when justified by V2 adoption.

# 15\. optional V3 OCR/vision service and extraction-profile tooling.

# 16\. docs site, playground, examples, interoperability fixtures and public test vectors.

# 

# Final deployment modes

# Library-only: application embeds Credaryn SDKs and manages its own trust/status infrastructure.

# Self-hosted standard: Docker Compose verifier \+ DSS adapter, with optional PostgreSQL-backed status/admin services.

# Enterprise: application SDK \+ enterprise KMS/HSM \+ configured trust bundle/did:web policy \+ verifier/status services, optionally deployed on Kubernetes.

# Air-gapped verifier: local trust bundles and offline PDF/paper verification; online lifecycle state is clearly marked unavailable/stale.

# Public community mode: project-hosted demo/public verifier may exist for convenience, but it is never required for cryptographic verification or self-host deployments.

# 

# Final data/storage rules

# Core SDKs are stateless by default.

# Private keys remain in local secure stores, KMS or HSM and are never stored in Credaryn databases.

# Status/admin persistent state uses PostgreSQL.

# Raw uploaded verification documents and scan images are ephemeral by default.

# Trust bundles/configuration are operator-controlled files/secrets or managed configuration, not a central Credaryn database requirement.

# Audit logs go to operator-selected logging/SIEM infrastructure.

# 

# Compatibility commitment

# 1.0 freezes Paper Seal Profile v1 and the normalized VerificationResult contract with semantic-versioning guarantees.

# Breaking protocol changes require a new profile version/prefix, never silent reinterpretation of CRD1 payloads.

# Verifier implementations retain support for all non-deprecated profile versions for the documented support window.

# Generated documents remain independently verifiable even if an optional Credaryn-hosted service disappears, provided required trust material is available.

# 

# Documentation required for project completion

# Architecture and trust model.

# Threat model and security assumptions.

# Paper Seal Profile v1 specification with binary/transport examples.

# PAdES implementation/conformance notes.

# Key management and rotation guide.

# AWS/GCP/Azure KMS guides and HSM/PKCS\#11 guide.

# Browser-print security-mode guide.

# Trust-policy/X.509/did:web guide.

# Lifecycle status guide.

# TrustVC/W3C VC interoperability guide.

# Self-host/Docker and enterprise deployment guide.

# Verifier REST API/OpenAPI documentation.

# OCR/V3 evidence and confidence guide.

# Migration/versioning policy.

# Privacy/data-retention guide.

# SECURITY.md and vulnerability-response policy.

# Compatibility matrix and benchmark/corpus results.

# 

# Final security/compliance engineering gates

# Independent security review completed and material findings fixed or publicly risk-accepted before stable 1.0.

# Dependency/SBOM/release provenance and signed-release processes operating in CI.

# Fuzz/property/mutation/adversarial parser tests in continuous integration.

# PAdES fixtures validated by reference and at least one independent compatible validator before 1.0.

# Paper vectors independently reproducible from the published specification.

# Key compromise and rotation drill documented and tested.

# No default deployment stores document contents merely for verification analytics.

# No security claim uses phrases such as unhackable, uneditable or AI-proof.

# Legal wording distinguishes technical signature validation from jurisdiction-specific qualified/electronic-signature status.

# 

## Definition of project done

# Credaryn is considered complete for the original project vision when ALL of the following are true:

# A. Digital: a controlled PDF is PAdES signed, independently validates and any unauthorized post-sign mutation is detected.

# B. Paper: the same issuance carries signed critical claims that can be verified after printing without the original PDF bytes.

# C. Browser: ordinary applications can create paper-verifiable browser prints without putting issuer private keys in frontend code or pretending to sign unknown OS print bytes.

# D. Trust: enterprise X.509/trust bundles and public did:web identity are supported with explicit trusted/untrusted semantics.

# E. Keys: local development, AWS KMS, Google Cloud KMS, Azure Key Vault and a production HSM/PKCS\#11 path are documented and tested to their promised support level.

# F. Lifecycle: current status can be checked independently of immutable issuance validity; W3C credentials use Bitstring Status List.

# G. Interop: TrustVC/W3C VC 2.0 support is working with did:web and ECDSA-SD-2023 without contaminating the core document path.

# H. Verification: SDK, CLI, PWA/widget and REST API share one result model and agree on fixtures.

# I. Self-hosting: a user can deploy the full required system without a Credaryn SaaS dependency.

# J. Enterprise operations: key rotation, trust configuration, OIDC administration, audit export, observability, retention and secure deployment are documented.

# K. Physical intelligence: V3 can compare signed critical claims with visible scanned values and clearly separate deterministic crypto facts from probabilistic OCR evidence.

# L. Quality: public vectors, interoperability fixtures, compatibility corpus, benchmarks, release provenance, security review and stable documentation exist.

# M. Developer experience: the reference happy path remains small and understandable; a developer can issue the first Credaryn document without learning PAdES/COSE/CBOR internals.

# N. Scope discipline: no blockchain, centralized CA, mandatory hosted service, invisible-watermark dependency or AI dependency enters the cryptographic trust path.

# 

# Post-completion backlog \- explicitly not required to call the project done

# Native iOS/Android apps when PWA is insufficient.

# Additional language SDKs beyond TypeScript/Node until adoption justifies them.

# BBS cryptosuite support unless standard maturity/use cases demand it.

# More QR/2D barcode profiles such as DataMatrix for sector interoperability.

# Qualified electronic signature provider integrations for specific legal jurisdictions.

# More OCR engines/models as pluggable alternatives.

# Semi-fragile watermark plugin if research proves value.

# Hosted SaaS control plane, billing or managed signing service.

# Blockchain/transparency log integrations requested by a specific ecosystem.

# These may become future roadmap items but cannot delay completion of the defined Credaryn product.

# 

# 22\. Milestone Sequence

&nbsp;

## Milestone 0 \- Standards and implementation spike

Run a bounded implementation spike against the locked decisions: prove the DSS 6.5 PAdES service boundary, generate/verify the Paper Seal Profile v1, freeze TypeScript interfaces and test vectors, and confirm no hidden interoperability blocker before feature development.

&nbsp;

## Milestone 1 \- Node SDK skeleton

Create monorepo, core types, signer interface, normalized verifier result and local development signer. TDD from the first implementation.

&nbsp;

## Milestone 2 \- Paper seal proof

Implement Paper Seal Profile v1 first, commit golden vectors, render QR payloads, decode them and verify trusted/untrusted/invalid verdicts offline.

&nbsp;

## Milestone 3 \- Controlled PDF proof

Integrate Puppeteer and the DSS 6.5 PdfSignatureEngine, produce a PAdES Baseline B-B PDF, validate it through DSS and prove post-signing modification fails.

&nbsp;

## Milestone 4 \- Unified verifier

CLI plus Docker web verifier with one normalized result across digital PDF and physical seal.

&nbsp;

## Milestone 5 \- Launch-quality invoice demo

Create the INR 11,800 \-\> INR 81,800 tamper demo and integration documentation.

&nbsp;

## Milestone 6 \- Browser print path

Add @credaryn/web preparation for window.print() with explicit security-mode reporting.

&nbsp;

## Milestone 7 \- Enterprise key lifecycle and cloud providers

Implement AWS KMS, Google Cloud KMS, Azure Key Vault, the PKCS\#11/HSM reference path, key rotation/history and shared ES256 provider vectors.

&nbsp;

## Milestone 8 \- V2 verifier platform, browser print and lifecycle status

Complete @credaryn/web prepareAndPrint(), verifier PWA/widget/REST API, X.509/did:web trust policies, optional PostgreSQL lifecycle-status/admin services, Docker Compose self-hosting, OIDC administration and audit/observability.

&nbsp;

## Milestone 9 \- Interoperability and adapter completion

Add TrustVC did:web \+ ECDSA-SD-2023 \+ Bitstring Status List interoperability, legacy OpenAttestation compatibility where required, PDFKit/Playwright adapters and only thin framework wrappers justified by real adoption.

&nbsp;

## Milestone 10 \- Security hardening and stable 1.0

Complete independent security review, fuzz/property/mutation testing, PAdES and paper-profile interoperability checks, supply-chain hardening, SBOM/provenance, performance/compatibility documentation and stable 1.0.

&nbsp;

## Milestone 11 \- V3 physical document intelligence

Implement the self-hosted PP-OCRv6/PP-StructureV3 vision sidecar, ExtractionProfiles, signed-vs-visible comparison, evidence/confidence UI and measured scan corpus. Watermarking remains optional research only.

&nbsp;

## Milestone 12 \- Project completion audit

Run every criterion in Section 21\. Publish the final compatibility matrix, corpus results, deployment guides, interoperability vectors and project-done checklist. Any unmet item is either completed or explicitly moved into the post-completion backlog before declaring the original Credaryn vision complete.

&nbsp;

# 23\. Build / Kill Checkpoints

&nbsp;

We should continue investing only if the project proves differentiated value, not merely technical elegance.

&nbsp;

## Checkpoint A \- after controlled PDF \+ paper proof

Continue if one SDK call can produce a document that validates digitally and exposes verifiable claims on paper without requiring developers to understand the underlying standards.

&nbsp;

## Checkpoint B \- after public demo

Continue if developers immediately understand the problem and can reproduce the demo from documentation without project-specific assistance.

&nbsp;

## Checkpoint C \- before enterprise expansion

Continue if interoperability, KMS/HSM support and self-hosted verification are strong enough that a security engineer can evaluate Credaryn as an integration layer rather than dismiss it as a proprietary signing format.

&nbsp;

## Reasons to stop or pivot

If a mature open-source project already provides the same cross-medium SDK and universal-verifier experience with similar simplicity.

If standards-compliant PDF plus paper verification cannot be integrated without unacceptable complexity.

If recipients have no realistic verification workflow and the seal provides no operational value.

If the project becomes primarily a custom protocol instead of an integration layer.

If security review finds that our composition creates misleading trust guarantees.

&nbsp;

# 24\. Current Decision Log

&nbsp;

## Finalized direction

Working project name: Credaryn, pending final legal and registry clearance.

Positioning: trust infrastructure for verifiable documents.

Standards-first architecture.

PAdES Baseline B-B is the V1 digital PDF profile; DSS 6.5 is the production/reference engine and CI validator, with B-T when an RFC 3161 TSA is configured.

W3C Verifiable Credentials interoperability is V2 through TrustVC; production issuer identity uses did:web and ECDSA-SD-2023 first.

Paper Seal Profile v1 is QR \+ Base45 \+ deterministic CBOR \+ COSE\_Sign1 \+ ES256, informed by ISO 22376 VDS concepts without claiming ISO conformance before review.

One normalized internal DocumentDescriptor, but no new general-purpose trust standard.

V1 baseline is Node.js 24 LTS \+ TypeScript 7 \+ pnpm 12; Rust/WASM is optional and must be justified by a measured need.

Private keys stay server-side/KMS/HSM.

Core offline verification remains a requirement.

Optional online lifecycle status is additive.

No blockchain requirement.

No AI in the cryptographic trust path.

OCR and forensic localization are V3.

Self-hosting and open source are core requirements; the project license is Apache-2.0.

The product moat is developer experience plus cross-medium business-document verification: exact digital authenticity, signed semantic claims that survive onto paper, browser-print support and standards interoperability.

&nbsp;

## Remaining pre-public checks

# Engineering decisions are locked. The following are external release checks, not implementation blockers:

# Final legal/trademark clearance for Credaryn in intended markets.

# Reserve the final domain, npm organization/scope and GitHub organization before the public announcement.

# Review the implemented Paper Seal Profile against the complete ISO 22376 text before making any formal conformance claim.

# Obtain an independent security review before stable 1.0.

# 

# 25\. Research Anchors

&nbsp;

ETSI PAdES digital-signature standards for PDF authenticity and integrity.

W3C Verifiable Credentials Data Model v2.0 and related Data Integrity / JOSE / COSE recommendations.

TrustVC for W3C VC 2.0 interoperability and legacy OpenAttestation compatibility; OpenAttestation itself is no longer the primary integration target.

ISO 22376:2023 Visible Digital Seal.

BSI and ICAO visible-digital-seal precedents for non-electronic documents.

Browser constraint: normal window.print() workflows do not expose the final OS-generated print/PDF bytes back to webpage JavaScript.

&nbsp;

These are implementation anchors. Credaryn's value is to make them usable together without forcing every application team to assemble the trust stack manually.

&nbsp;

# Additional implementation anchors locked for V2/V3:

# W3C Bitstring Status List v1.0 is a W3C Recommendation dated 15 May 2025 and is the required W3C credential revocation/status mechanism for Credaryn V2.

# W3C Data Integrity ECDSA Cryptosuites v1.0 is a W3C Recommendation dated 15 May 2025; ECDSA-SD-2023 is the first W3C selective-disclosure cryptosuite used by Credaryn interoperability.

# TrustVC supports did:web and ECDSA-SD-2023 and is the active interoperability path chosen for V2.

# BBS cryptosuites are not required for completion because the BBS Data Integrity specification is still less mature than the ECDSA Recommendation path as of the 2026 planning baseline.

# AWS KMS supports ECC\_NIST\_P256 \+ ECDSA\_SHA\_256; Google Cloud KMS recommends EC\_SIGN\_P256\_SHA256; Azure Key Vault/Managed HSM supports P-256 \+ ES256. These are the first-party cloud provider mappings.

# PP-OCRv6 was released in June 2026 and is the V3 default printed-document OCR family; PP-StructureV3 is the reference layout/document preprocessing pipeline.

# 

# 26\. Project Principle

&nbsp;

Credaryn should make one difficult thing boring:

&nbsp;

A developer generates a document.

Credaryn applies the right trust standards.

The document can move from software to PDF to paper.

Anyone with the required trust material can independently verify what the issuer actually issued.

&nbsp;

The long-term product should be judged by that simplicity, not by how much custom cryptography we write.