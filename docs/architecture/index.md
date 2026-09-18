# Architecture index

Credaryn keeps standards and providers behind narrow byte/result contracts. Start with [the data contract](data-contract.md), [trust model](trust-model.md), [normalized verification result](verification-result.md), [PAdES boundary](pades-conformance.md), [Paper Seal Profile](paper-seal-profile-v1.md), and [browser-print boundary](browser-print.md).

`@credaryn/core` owns contracts and policy. Provider, DSS, TrustVC, status, UI, and deployment code depend inward; they do not redefine trust semantics. Core verification requires no hosted Credaryn service, blockchain, OCR, or watermark.
