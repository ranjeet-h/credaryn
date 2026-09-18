# Milestone 9 interoperability matrix

| Surface | Format / implementation | Status | Verification boundary |
| --- | --- | --- | --- |
| W3C VC | TrustVC, VC Data Model v2, ECDSA-SD-2023 | Implemented | `standards/trustvc` normalized result |
| Issuer identity | `did:key` local/test | Implemented | deterministic in-memory DID resolution |
| Issuer identity | `did:web` production shape | Implemented | injected/local DID document in fixtures; deployment hosts `did.json` |
| Credential lifecycle | Bitstring Status List v1.0 | Implemented | `BitstringStatusListEntry` references |
| Legacy VC | OpenAttestation | Deferred | no adoption fixture; read-only compatibility may be added later |
| PDF renderer | Puppeteer | Existing V1 | shared `createPdfPipeline` |
| PDF renderer | PDFKit | Implemented | shared pipeline + DSS boundary |
| PDF renderer | Playwright | Implemented | server-side PDF generation + shared pipeline |
| Framework helpers | React / Next | Deferred | no consumer or adoption evidence; no speculative security API |
| Cryptosuite | BBS-2023 | Out of scope | not imported by Credaryn APIs |
| Barcode | DataMatrix | Out of scope | QR-only Paper Seal remains unchanged |
| Ledger | blockchain / TradeTrust | Out of scope | no dependency or issuance path |

No row marked deferred or out of scope is silently treated as complete.
