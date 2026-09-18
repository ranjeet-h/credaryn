import { describe, expect, it } from "vitest";
import {
  cameraUnavailableMessage,
  captureVideoFrame,
  extractBarcodeValue,
  isSupportedImageType,
  normalizeImageToPng,
  pickCameraConstraints,
  supportsBarcodeDetector,
} from "../src/ui/camera.js";

describe("PWA camera helpers", () => {
  it("passes PNG through and re-encodes camera photos to PNG via canvas", async () => {
    const png = new Blob([new Uint8Array([1])], { type: "image/png" });
    expect(await normalizeImageToPng(png)).toBe(png);

    const jpeg = new Blob([new Uint8Array([2])], { type: "image/jpeg" });
    const converted = await normalizeImageToPng(jpeg, {
      createImageBitmap: async () => ({ width: 2, height: 1 }),
      createCanvas: (width, height) => ({
        width,
        height,
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (callback, type) => callback(new Blob([new Uint8Array([3])], { type: type ?? "image/png" })),
      }),
    });

    expect(converted.type).toBe("image/png");
  });

  it("rejects non-image input before touching the canvas", async () => {
    await expect(normalizeImageToPng(new Blob([new Uint8Array([1])], { type: "application/pdf" }))).rejects.toThrow(/Unsupported image/);
  });

  it("detects a native BarcodeDetector and prefers the environment camera", () => {
    expect(supportsBarcodeDetector({ BarcodeDetector: function BarcodeDetector() {} })).toBe(true);
    expect(supportsBarcodeDetector({})).toBe(false);
    expect(pickCameraConstraints()).toEqual({ audio: false, video: { facingMode: "environment" } });
  });

  it("extracts the first non-empty barcode value and captures a video frame", () => {
    expect(extractBarcodeValue([{ rawValue: "" }, { rawValue: "CRD1:abc" }, { rawValue: "later" }])).toBe("CRD1:abc");
    expect(extractBarcodeValue(undefined)).toBeUndefined();

    const frame = captureVideoFrame({ videoWidth: 100, videoHeight: 50 }, {
      createCanvas: (width, height) => ({
        width,
        height,
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: () => undefined,
      }),
    });
    expect(frame.width).toBe(100);
    expect(frame.height).toBe(50);
    expect(frame.canvas.width).toBe(100);
  });

  it("returns a graceful fallback message for camera errors", () => {
    expect(cameraUnavailableMessage({ name: "NotAllowedError" })).toContain("denied");
    expect(cameraUnavailableMessage(new Error("boom"))).toContain("unavailable");
    expect(isSupportedImageType("image/heic")).toBe(true);
    expect(isSupportedImageType("application/pdf")).toBe(false);
  });
});
