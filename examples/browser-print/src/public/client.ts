// @ts-expect-error The browser module is served by the example server at runtime.
import { prepareAndPrint, preparePrint } from "/web/index.js";

const descriptor = {
  issuerId: "acme-retail",
  documentId: "INV-2026-82919",
  documentType: "invoice",
  issuedAt: "2026-01-01T00:00:00Z",
  claims: {
    currency: "INR",
    invoiceNumber: "INV-2026-82919",
    totalMinor: 1_180_000,
    paid: false,
  },
};

const status = document.querySelector("#status");
const options = {
  descriptor,
  issueSealUrl: "/issue-seal",
  target: "#paper-seal-target",
};

interface PreparedPrintResult {
  securityMode: string;
  verificationText: string;
}

document.querySelector("#prepare-print")?.addEventListener("click", async () => {
  await run(async () => preparePrint(options));
});

document.querySelector("#prepare-and-print")?.addEventListener("click", async () => {
  await run(async () => prepareAndPrint(options));
});

async function run(action: () => Promise<PreparedPrintResult>): Promise<void> {
  try {
    const prepared = await action();
    if (status !== null) status.textContent = `${prepared.securityMode} · ${prepared.verificationText}`;
  } catch (error) {
    if (status !== null) status.textContent = `Seal issuance failed · ${error instanceof Error ? error.message : "unknown error"}`;
  }
}
