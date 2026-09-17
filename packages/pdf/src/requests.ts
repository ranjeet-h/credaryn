export const MAX_PDF_BYTES = 16 * 1024 * 1024;

export function assertPdfBytes(input: Uint8Array): void {
  if (!(input instanceof Uint8Array)) throw new Error("PDF input must be a Uint8Array");
  if (input.byteLength === 0) throw new Error("PDF input must not be empty");
  if (input.byteLength > MAX_PDF_BYTES) throw new Error("PDF input exceeds the maximum size of 16 MiB");
}

export function toBase64(input: Uint8Array): string {
  assertPdfBytes(input);
  return Buffer.from(input).toString("base64");
}
