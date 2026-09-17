export interface SealIssueResponse {
  qrText: string;
  verificationText: string;
  securityMode: "PAPER_CLAIMS_ONLY";
  qrDataUrl: string;
}

export function injectSeal(target: Element, issue: SealIssueResponse): void {
  if (typeof globalThis.document === "undefined") throw new Error("Seal rendering requires a browser document");

  const existingSeals = target.querySelectorAll?.("[data-credaryn-paper-seal]");
  existingSeals?.forEach((existing) => existing.remove());
  const seal = globalThis.document.createElement("div");
  seal.setAttribute("data-credaryn-paper-seal", issue.qrText);
  seal.setAttribute("data-credaryn-security-mode", issue.securityMode);
  seal.setAttribute("role", "group");
  seal.setAttribute("aria-label", "Credaryn Paper Seal");
  seal.textContent = issue.verificationText;

  if (issue.qrDataUrl !== undefined) {
    const qr = globalThis.document.createElement("img") as HTMLImageElement;
    qr.alt = "Credaryn Paper Seal QR code";
    qr.src = issue.qrDataUrl;
    qr.setAttribute("data-credaryn-qr", "true");
    seal.append(qr);
  }

  const transport = globalThis.document.createElement("code");
  transport.textContent = issue.qrText;
  transport.setAttribute("data-credaryn-qr-text", "true");
  seal.append(transport);
  target.setAttribute("data-credaryn-security-mode", issue.securityMode);
  target.append(seal);
}
