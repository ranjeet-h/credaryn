import { describe, expect, it } from "vitest";
import { preparePrint } from "../src/prepare-print.js";

describe("browser print security mode", () => {
  it("rejects a server response that claims a digitally signed artifact", async () => {
    const target = { setAttribute: () => undefined, append: () => undefined };

    await expect(preparePrint({
      descriptor: {
        issuerId: "acme-retail",
        documentId: "INV-2026-82919",
        documentType: "invoice",
        issuedAt: "2026-01-01T00:00:00Z",
        claims: { currency: "INR", totalMinor: 1_180_000 },
      },
      issueSealUrl: "/issue-seal",
      target: target as unknown as Element,
      fetchImpl: async () => new Response(JSON.stringify({
        qrText: "CRD1:SIGNED-CLAIMS",
        verificationText: "Invoice INV-2026-82919 · INR 11,800.00",
        securityMode: "DIGITAL_ARTIFACT_SIGNED",
      }), { status: 200 }),
    })).rejects.toThrow(/PAPER_CLAIMS_ONLY/);
  });
});
