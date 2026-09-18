import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readUi(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(`../src/ui/${name}`, import.meta.url)), "utf8");
}

describe("PWA camera source", () => {
  it("wires getUserMedia, BarcodeDetector and PNG normalization without eval", async () => {
    const app = await readUi("app.js");
    expect(app).toContain("getUserMedia");
    expect(app).toContain("BarcodeDetector");
    expect(app).toContain("normalizeImageToPng");
    expect(app).not.toMatch(/eval\(|new Function/);

    const html = await readUi("index.html");
    expect(html).toContain('id="camera-start"');
    expect(html).toContain('id="camera-capture"');
    expect(html).toContain('type="module"');
    expect(html).toContain("image/jpeg");

    const serviceWorker = await readUi("service-worker.js");
    expect(serviceWorker).toContain("/camera.js");
  });
});
