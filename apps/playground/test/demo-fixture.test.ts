import { describe, expect, it } from "vitest";
import { renderInvoiceHtml } from "../../../examples/invoice-puppeteer/src/render.js";
import { loadInvoiceFixture } from "../../../examples/invoice-puppeteer/src/seal.js";
import {
  DEMO_INVOICE_TOTAL_MINOR,
  TAMPERED_INVOICE_TOTAL_MINOR,
  describeTamperResult,
} from "../src/demo.js";

describe("launch-quality invoice demo fixture", () => {
  it("uses the exact INR 11,800 signed invoice fixture", async () => {
    const fixture = await loadInvoiceFixture();

    expect(fixture.descriptor.issuerId).toBe("acme-retail");
    expect(fixture.descriptor.documentId).toBe("INV-2026-82919");
    expect(fixture.descriptor.claims.currency).toBe("INR");
    expect(fixture.descriptor.claims.totalMinor).toBe(DEMO_INVOICE_TOTAL_MINOR);
    expect(fixture.paperSealTransport).toMatch(/^CRD1:/);
  });

  it("describes the visible INR 81,800 tamper without changing the signed paper claim", () => {
    const result = describeTamperResult();

    expect(result.visibleTotalMinor).toBe(TAMPERED_INVOICE_TOTAL_MINOR);
    expect(result.signedPaperTotalMinor).toBe(DEMO_INVOICE_TOTAL_MINOR);
    expect(result.expectedPdfVerdict).toBe("INVALID");
    expect(result.expectedPaperVerdict).toBe("VALID_TRUSTED");
  });

  it("renders INR 81,800 visibly while retaining the original signed paper transport", async () => {
    const fixture = await loadInvoiceFixture();
    const tamperedDescriptor = {
      ...fixture.descriptor,
      claims: { ...fixture.descriptor.claims, totalMinor: TAMPERED_INVOICE_TOTAL_MINOR },
    };
    const originalHtml = renderInvoiceHtml(fixture.descriptor, fixture.paperSealTransport);
    const tamperedHtml = renderInvoiceHtml(tamperedDescriptor, fixture.paperSealTransport);

    expect(originalHtml).toContain("INR 11,800.00");
    expect(tamperedHtml).toContain("INR 81,800.00");
    expect(tamperedHtml).toContain(fixture.paperSealTransport);
  });
});
