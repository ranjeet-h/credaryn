// Browser-only helpers for the PWA camera path. Kept dependency-free and with all
// DOM access injectable so the pure logic can be unit-tested under Node.

export function isSupportedImageType(type) {
  return typeof type === "string" && type.startsWith("image/");
}

export function supportsBarcodeDetector(scope = globalThis) {
  return typeof scope.BarcodeDetector === "function";
}

export function pickCameraConstraints(facingMode = "environment") {
  return { audio: false, video: { facingMode } };
}

export function extractBarcodeValue(detections) {
  if (!Array.isArray(detections)) return undefined;
  for (const detection of detections) {
    if (typeof detection?.rawValue === "string" && detection.rawValue.trim() !== "") return detection.rawValue.trim();
  }
  return undefined;
}

/**
 * Re-encodes a camera photo to PNG via a canvas so JPEG/HEIC camera output is accepted
 * by the PNG-only paper-seal pipeline. PNG input passes through unchanged.
 */
export async function normalizeImageToPng(blob, options = {}) {
  if (blob.type === "image/png") return blob;
  if (!isSupportedImageType(blob.type)) throw new Error(`Unsupported image type: ${blob.type || "unknown"}`);
  const createImageBitmap = options.createImageBitmap ?? globalThis.createImageBitmap;
  if (typeof createImageBitmap !== "function") throw new Error("Image decoding is not available in this browser");
  const createCanvas = options.createCanvas ?? ((width, height) => {
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
  const bitmap = await createImageBitmap(blob);
  const canvas = createCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (context === null || context === undefined) throw new Error("Unable to prepare an image canvas");
  context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((png) => {
      if (png === null || png === undefined) {
        reject(new Error("PNG conversion failed"));
        return;
      }
      resolve(png);
    }, "image/png");
  });
}

export function captureVideoFrame(video, options = {}) {
  const createCanvas = options.createCanvas ?? ((width, height) => {
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
  const width = video.videoWidth || options.fallbackWidth || 1280;
  const height = video.videoHeight || options.fallbackHeight || 720;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (context === null || context === undefined) throw new Error("Unable to prepare a camera canvas");
  context.drawImage(video, 0, 0, width, height);
  return { canvas, width, height };
}

export function cameraUnavailableMessage(error) {
  const name = error?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was denied. Upload a photo or paste the CRD1 payload instead.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No usable camera was found. Upload a photo or paste the CRD1 payload instead.";
  return "Camera QR scanning is unavailable in this browser. Upload a photo instead.";
}
