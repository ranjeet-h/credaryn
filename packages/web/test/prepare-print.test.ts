import { afterEach, describe, expect, it } from "vitest";
import type { DocumentDescriptor } from "@credaryn/core";
import { prepareAndPrint, preparePrint } from "../src/prepare-print.js";

const descriptor: DocumentDescriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: { currency: "INR", totalMinor: 1_180_000 },
};

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
});

describe("preparePrint", () => {
  it("issues a seal through the trusted server and injects only the explicit target", async () => {
    const target = new FakeElement();
    installFakeBrowser(target);
    const requests: RequestInit[] = [];

    const prepared = await preparePrint({
      descriptor,
      issueSealUrl: "/issue-seal",
      target: target as unknown as Element,
      fetchImpl: async (_input, init) => {
        requests.push(init ?? {});
        return response({
          qrText: "CRD1:SIGNED-CLAIMS",
          qrDataUrl: "data:image/png;base64,fixture",
          verificationText: "Invoice INV-2026-82919 · INR 11,800.00",
          securityMode: "PAPER_CLAIMS_ONLY",
        });
      },
    });

    expect(requests[0]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(descriptor),
    });
    expect(prepared.securityMode).toBe("PAPER_CLAIMS_ONLY");
    expect(prepared.qrText).toBe("CRD1:SIGNED-CLAIMS");
    expect(target.attributes["data-credaryn-security-mode"]).toBe("PAPER_CLAIMS_ONLY");
    expect(target.children).toHaveLength(1);
    expect(target.children[0]?.textContent).toContain("Invoice INV-2026-82919");
    expect(target.children[0]?.attributes["data-credaryn-paper-seal"]).toBe("CRD1:SIGNED-CLAIMS");
    expect(target.children[0]?.children).toHaveLength(2);
    expect(target.children[0]?.children[0]?.attributes["data-credaryn-qr"]).toBe("true");
  });

  it("rejects issuance failure before touching the print target", async () => {
    const target = new FakeElement();
    installFakeBrowser(target);

    await expect(preparePrint({
      descriptor,
      issueSealUrl: "/issue-seal",
      target: target as unknown as Element,
      fetchImpl: async () => response({ error: "issuer unavailable" }, 503),
    })).rejects.toThrow(/HTTP 503/);

    expect(target.children).toHaveLength(0);
    expect(target.attributes["data-credaryn-security-mode"]).toBeUndefined();
  });

  it("rejects a missing explicit target and malformed server responses", async () => {
    installFakeBrowser(new FakeElement());

    await expect(preparePrint({
      descriptor,
      issueSealUrl: "/issue-seal",
      target: "#missing",
      fetchImpl: async () => response({}),
    })).rejects.toThrow(/target/);

    const target = new FakeElement();
    await expect(preparePrint({
      descriptor,
      issueSealUrl: "/issue-seal",
      target: target as unknown as Element,
      fetchImpl: async () => response({ qrText: "CRD1:SIGNED-CLAIMS", qrDataUrl: "data:image/png;base64,fixture", securityMode: "PAPER_CLAIMS_ONLY" }),
    })).rejects.toThrow(/verificationText/);
  });

  it("completes issuance before prepareAndPrint invokes window.print", async () => {
    const target = new FakeElement();
    const events: string[] = [];
    installFakeBrowser(target, () => events.push("print"));

    await prepareAndPrint({
      descriptor,
      issueSealUrl: "/issue-seal",
      target: target as unknown as Element,
      fetchImpl: async () => {
        events.push("issued");
        return response({
          qrText: "CRD1:SIGNED-CLAIMS",
          qrDataUrl: "data:image/png;base64,fixture",
          verificationText: "Invoice INV-2026-82919 · INR 11,800.00",
          securityMode: "PAPER_CLAIMS_ONLY",
        });
      },
    });

    expect(events).toEqual(["issued", "print"]);
  });
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function installFakeBrowser(target: FakeElement, print: () => void = () => undefined): void {
  globalThis.document = {
    querySelector: (selector: string) => selector === "#missing" ? null : target,
    createElement: () => new FakeElement(),
  } as unknown as Document;
  globalThis.window = { print } as unknown as Window & typeof globalThis;
}

class FakeElement {
  readonly attributes: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  textContent = "";
  src = "";

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  append(child: FakeElement): void {
    this.children.push(child);
  }
}
