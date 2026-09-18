export interface CanvasContextLike {
  drawImage(source: unknown, dx: number, dy: number, dw: number, dh: number): void;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: string): CanvasContextLike | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

export interface ImageBitmapLike {
  width: number;
  height: number;
}

export interface ImageNormalizationOptions {
  createImageBitmap?: (blob: Blob) => Promise<ImageBitmapLike>;
  createCanvas?: (width: number, height: number) => CanvasLike;
}

export interface CaptureVideoFrameOptions {
  createCanvas?: (width: number, height: number) => CanvasLike;
  fallbackWidth?: number;
  fallbackHeight?: number;
}

export function isSupportedImageType(type: unknown): boolean;
export function supportsBarcodeDetector(scope?: { BarcodeDetector?: unknown }): boolean;
export function pickCameraConstraints(facingMode?: string): { audio: boolean; video: { facingMode: string } };
export function extractBarcodeValue(detections: unknown): string | undefined;
export function normalizeImageToPng(blob: Blob, options?: ImageNormalizationOptions): Promise<Blob>;
export function captureVideoFrame(video: { videoWidth?: number; videoHeight?: number }, options?: CaptureVideoFrameOptions): { canvas: CanvasLike; width: number; height: number };
export function cameraUnavailableMessage(error: unknown): string;
