import {
  BinaryBitmap,
  DecodeHintType,
  GlobalHistogramBinarizer,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { PNG } from "pngjs";
import QRCode from "qrcode";
import { PAPER_PROFILE_PREFIX } from "./encode.js";

const MAX_QR_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_QR_DIMENSION = 4_096;

export interface PaperQrRenderOptions {
  width?: number;
  margin?: number;
  scale?: number;
}

export class PaperQrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaperQrError";
  }
}

export async function renderPaperSealQr(
  transport: string,
  options: PaperQrRenderOptions = {},
): Promise<Uint8Array> {
  if (!transport.startsWith(PAPER_PROFILE_PREFIX)) throw new PaperQrError("QR content must start with CRD1:");
  const width = options.width ?? 512;
  const margin = options.margin ?? 4;
  if (!Number.isInteger(width) || width < 128 || width > MAX_QR_DIMENSION) {
    throw new PaperQrError(`QR width must be an integer from 128 to ${MAX_QR_DIMENSION}`);
  }
  if (!Number.isInteger(margin) || margin < 0 || margin > 16) throw new PaperQrError("QR margin must be an integer from 0 to 16");
  const qr = QRCode.create(transport, { errorCorrectionLevel: "M" });
  const scale = options.scale ?? Math.max(1, Math.floor(width / (qr.modules.size + margin * 2)));
  if (!Number.isInteger(scale) || scale < 1 || scale > 32) throw new PaperQrError("QR scale must be an integer from 1 to 32");

  try {
    const png = await QRCode.toBuffer(transport, {
      type: "png",
      scale,
      margin,
      errorCorrectionLevel: "M",
    });
    return new Uint8Array(png);
  } catch (error) {
    throw new PaperQrError(error instanceof Error ? error.message : "QR rendering failed");
  }
}

export function decodePaperSealQr(image: Uint8Array): string {
  if (!(image instanceof Uint8Array)) throw new PaperQrError("QR image must be PNG bytes");
  if (image.byteLength > MAX_QR_IMAGE_BYTES) throw new PaperQrError("QR image exceeds the maximum size of 4 MiB");
  assertPngDimensions(image);

  let png: PNG;
  try {
    png = PNG.sync.read(Buffer.from(image));
  } catch (error) {
    throw new PaperQrError(error instanceof Error ? error.message : "QR image is not valid PNG");
  }
  if (png.width > MAX_QR_DIMENSION || png.height > MAX_QR_DIMENSION) {
    throw new PaperQrError("QR image dimensions exceed the configured limit");
  }

  try {
    const pixels = new Int32Array(png.width * png.height);
    for (let index = 0; index < pixels.length; index += 1) {
      const sourceOffset = index * 4;
      pixels[index] = (png.data[sourceOffset]! << 16)
        | (png.data[sourceOffset + 1]! << 8)
        | png.data[sourceOffset + 2]!;
    }
    const source = new RGBLuminanceSource(pixels, png.width, png.height);
    const reader = new QRCodeReader();
    const pureBarcodeHints = new Map([[DecodeHintType.PURE_BARCODE, true]]);
    let result: string;
    try {
      // Generated PNGs have an exact quiet zone and integer module boundaries.
      // PURE_BARCODE avoids detector sensitivity to valid QR mask patterns.
      result = reader.decode(new BinaryBitmap(new HybridBinarizer(source)), pureBarcodeHints).getText();
    } catch {
      try {
        result = reader.decode(new BinaryBitmap(new GlobalHistogramBinarizer(source)), pureBarcodeHints).getText();
      } catch {
        // Keep a detector-based fallback for PNGs produced by printers/scanners
        // where the quiet zone or module boundaries may no longer be exact.
        result = reader.decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
      }
    }
    if (!result.startsWith(PAPER_PROFILE_PREFIX)) throw new PaperQrError("QR content does not contain a CRD1 Paper Seal");
    return result;
  } catch (error) {
    if (error instanceof PaperQrError) throw error;
    throw new PaperQrError(error instanceof Error ? error.message : "QR decoding failed");
  }
}

function assertPngDimensions(image: Uint8Array): void {
  if (image.byteLength < 24 || !startsWith(image, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    throw new PaperQrError("QR image is not a valid PNG");
  }
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  if (view.getUint32(8) !== 13 || !startsWith(image.subarray(12, 16), [0x49, 0x48, 0x44, 0x52])) {
    throw new PaperQrError("QR image is missing a valid PNG header");
  }
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0 || width > MAX_QR_DIMENSION || height > MAX_QR_DIMENSION) {
    throw new PaperQrError("QR image dimensions exceed the configured limit");
  }
}

function startsWith(input: Uint8Array, prefix: readonly number[]): boolean {
  return input.length >= prefix.length && prefix.every((byte, index) => input[index] === byte);
}
