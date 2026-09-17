# Phase 1 data contract

`DocumentDescriptor` is the application input to every issuing flow. V1 requires non-empty `issuerId`, `documentId`, `documentType`, an RFC 3339 `issuedAt`, and a flat `claims` map containing only strings, booleans and safe integers. Production `statusUrl` values use HTTPS; local HTTP is permitted only with `environment: "development"` and a loopback host.

```ts
import { validateDescriptor } from "@credaryn/core";

const result = validateDescriptor({
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: {
    currency: "INR",
    invoiceNumber: "INV-2026-82919",
    totalMinor: 1_180_000,
  },
});

if (!result.valid) {
  console.error(result.issues);
}
```

`normalizeDescriptor()` returns a new descriptor with claim keys sorted by code-unit order. It never drops unsupported values; callers must validate first. `assertValidDescriptor()` throws `DescriptorValidationError` with structured paths for invalid input.

The Phase 1 SDK façade is constructed with the stable boundaries:

```ts
import { Credaryn } from "@credaryn/node";

const credaryn = new Credaryn({ pdfEngine, paperSigner, trustStore });
```

`sealPdf()` validates the descriptor, computes the artifact digest internally and delegates bytes to the PDF engine. Paper Seal creation remains explicitly unavailable until Milestone 2; verification returns `UNVERIFIABLE` rather than claiming validity.

## Phase 1 manual smoke command

From `packages/node`, run this with the development-only signer. The fake PDF engine is intentional: the real PDF implementation is a later milestone.

```bash
node --import tsx --input-type=module <<'EOF'
import { Credaryn } from "@credaryn/node";
import { validateDescriptor } from "@credaryn/core";
import { DemoTrustStore } from "../../providers/local/src/demo-trust-store.ts";
import { LocalSigner } from "../../providers/local/src/local-signer.ts";

const descriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1180000 },
};
const signer = new LocalSigner({ issuerId: descriptor.issuerId, keyId: "phase-1-local" });
const keyInfo = await signer.getKeyInfo();
const trustStore = new DemoTrustStore([keyInfo]);
const pdfEngine = {
  sign: async (bytes) => bytes,
  verify: async () => ({ cryptographicValidity: "UNVERIFIABLE", artifactIntegrity: "UNKNOWN" }),
};
const sdk = new Credaryn({ pdfEngine, paperSigner: signer, trustStore });
const verification = await sdk.verifyPdf(new Uint8Array([37]));

console.log({
  descriptorValid: validateDescriptor(descriptor).valid,
  key: { issuerId: keyInfo.issuerId, keyId: keyInfo.keyId, algorithm: keyInfo.algorithm },
  trust: { source: trustStore.trustSource, developmentOnly: trustStore.isDevelopmentOnly },
  keyHasPrivateKey: Object.hasOwn(keyInfo, "privateKey"),
  verdict: verification.verdict,
  securityMode: verification.securityMode,
});
EOF
```

Expected output includes `descriptorValid: true`, `trust.developmentOnly: true`, `keyHasPrivateKey: false`, `verdict: "UNVERIFIABLE"` and `securityMode: "DIGITAL_ARTIFACT_SIGNED"`. Change `totalMinor` to `8180000` and rerun `validateDescriptor`; it remains a valid, distinct descriptor rather than being silently replaced with the original claim.
