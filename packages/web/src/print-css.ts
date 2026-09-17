export const PRINT_CSS = `
@media print {
  [data-credaryn-paper-seal] {
    break-inside: avoid;
    page-break-inside: avoid;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  [data-credaryn-paper-seal] img[data-credaryn-qr] {
    display: block;
    width: 32mm;
    height: 32mm;
    image-rendering: pixelated;
  }
}
`;

export function applyPrintCss(): void {
  if (typeof globalThis.document === "undefined") throw new Error("Print CSS requires a browser document");
  const existing = globalThis.document.head?.querySelector("style[data-credaryn-print-css]");
  if (existing !== undefined && existing !== null) return;
  const style = globalThis.document.createElement("style");
  style.setAttribute("data-credaryn-print-css", "true");
  style.textContent = PRINT_CSS;
  globalThis.document.head?.append(style);
}
