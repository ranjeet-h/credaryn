import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { PaperQrError, decodePaperSealQr, renderPaperSealQr } from "../src/qr.js";

const transport = `CRD1:${"0".repeat(40)}`;

describe("Paper Seal QR rendering validation", () => {
  it("rejects content that does not start with the CRD1 prefix", async () => {
    await expect(renderPaperSealQr("NOT-A-SEAL")).rejects.toThrow(PaperQrError);
  });

  it("validates width, margin and scale bounds", async () => {
    await expect(renderPaperSealQr(transport, { width: 10 })).rejects.toThrow(/width/);
    await expect(renderPaperSealQr(transport, { margin: -1 })).rejects.toThrow(/margin/);
    await expect(renderPaperSealQr(transport, { scale: 0 })).rejects.toThrow(/scale/);
  });
});

describe("Paper Seal QR decoding validation", () => {
  it("rejects non-byte and oversized images", () => {
    expect(() => decodePaperSealQr("not-bytes" as unknown as Uint8Array)).toThrow(PaperQrError);
    expect(() => decodePaperSealQr(new Uint8Array(4 * 1024 * 1024 + 1))).toThrow(/maximum size/);
  });

  it("rejects images without a valid PNG signature or header", () => {
    expect(() => decodePaperSealQr(new Uint8Array([1, 2, 3]))).toThrow(/not a valid PNG/);

    const badHeader = new Uint8Array(24);
    badHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    badHeader.set([0x49, 0x48, 0x44, 0x52], 12);
    expect(() => decodePaperSealQr(badHeader)).toThrow(/missing a valid PNG header/);
  });

  it("rejects a PNG truncated after a valid header", async () => {
    const png = await QRCode.toBuffer("CRD1:0000", { type: "png", scale: 4, margin: 4 });

    expect(() => decodePaperSealQr(new Uint8Array(png.subarray(0, 30)))).toThrow(PaperQrError);
  });

  it("rejects a QR code whose content is not a Paper Seal", async () => {
    const png = await QRCode.toBuffer("https://example.test/not-a-paper-seal", {
      type: "png",
      scale: 4,
      margin: 4,
    });

    expect(() => decodePaperSealQr(new Uint8Array(png))).toThrow(/does not contain a CRD1/);
  });

  it("fails closed when the image contains no decodable QR code", () => {
    const blank = new PNG({ width: 64, height: 64 });
    blank.data.fill(255);
    const png = PNG.sync.write(blank);

    expect(() => decodePaperSealQr(new Uint8Array(png))).toThrow(PaperQrError);
  });
});
