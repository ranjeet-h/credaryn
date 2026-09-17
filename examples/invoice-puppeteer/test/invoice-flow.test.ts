import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";
import { DemoTrustStore } from "@credaryn/provider-local/demo-trust-store";
import { verifyPaperSeal } from "@credaryn/paper";
import { renderInvoiceHtml } from "../src/render.js";
import { loadInvoiceFixture, mutatePdfBytes, mutatePdfContentBytes, mutatePdfMetadataBytes } from "../src/seal.js";

describe("Puppeteer invoice reference flow", () => {
  it("places the CRD1 seal in the controlled invoice HTML before PDF materialization", async () => {
    const fixture = await loadInvoiceFixture();
    const html = renderInvoiceHtml(fixture.descriptor, fixture.paperSealTransport);

    expect(html).toContain('data-credaryn-paper-seal="CRD1:"');
    expect(html).toContain("INV-2026-82919");
    expect(html).toContain("INR 11,800.00");
  });

  it("mutates a post-signing PDF byte without mutating the original buffer", async () => {
    const pdf = new Uint8Array(await readFile(new URL("../../../test-vectors/pdf/invoice-11800.pdf", import.meta.url)));
    const mutated = mutatePdfBytes(pdf);

    expect(mutated).not.toEqual(pdf);
    expect(mutated).toHaveLength(pdf.length);
    expect(pdf).toEqual(new Uint8Array(await readFile(new URL("../../../test-vectors/pdf/invoice-11800.pdf", import.meta.url))));
  });

  it("has DSS reject the signed PDF mutation and rejects a copied seal for another document", async () => {
    const fixture = await loadInvoiceFixture();
    const signedPdf = new Uint8Array(await readFile(new URL("../../../test-vectors/pdf/invoice-11800.pdf", import.meta.url)));
    const engine = new DssPdfSignatureEngine({ endpoint: process.env.DSS_URL ?? "http://127.0.0.1:8080" });
    const original = await engine.verify(signedPdf, { trustStore: new DemoTrustStore([]) });
    const mutated = await engine.verify(mutatePdfBytes(signedPdf), { trustStore: new DemoTrustStore([]) });
    const contentMutation = await engine.verify(mutatePdfContentBytes(signedPdf), { trustStore: new DemoTrustStore([]) });
    const metadataMutation = await engine.verify(mutatePdfMetadataBytes(signedPdf), { trustStore: new DemoTrustStore([]) });
    const paperKey = await fixture.paperSigner.getKeyInfo();
    const copiedSeal = await verifyPaperSeal(fixture.paperSealTransport, {
      expectedDescriptor: { ...fixture.descriptor, documentId: "INV-2026-82920" },
      trustStore: new DemoTrustStore([paperKey]),
    });

    expect(original).toMatchObject({ cryptographicValidity: "VALID", artifactIntegrity: "VALID" });
    expect(mutated).toMatchObject({ cryptographicValidity: "INVALID", artifactIntegrity: "INVALID" });
    expect(contentMutation).toMatchObject({ cryptographicValidity: "INVALID", artifactIntegrity: "INVALID" });
    expect(metadataMutation).toMatchObject({ cryptographicValidity: "INVALID", artifactIntegrity: "INVALID" });
    expect(copiedSeal).toMatchObject({ verdict: "INVALID" });
  });
});
