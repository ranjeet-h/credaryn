import { describe, expect, it } from "vitest";
import { PaperQrError, decodePaperSealQr } from "../../src/qr.js";

describe("PNG decompression boundary", () => {
  it("rejects oversized declared dimensions before PNG decompression", () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0, 0, 0, 13], 8);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(png.buffer).setUint32(16, 4_097);
    new DataView(png.buffer).setUint32(20, 4_097);

    expect(() => decodePaperSealQr(png)).toThrow(PaperQrError);
    expect(() => decodePaperSealQr(png)).toThrow(/dimensions exceed/i);
  });
});
