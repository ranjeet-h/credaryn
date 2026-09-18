import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { encodePaperSeal, renderPaperSealQr, verifyPaperSeal } from "../src/index.js";
import { vectorDescriptor, vectorKeyInfo, vectorSigner } from "./vector-fixture.js";

const vectorDirectory = resolve(dirname(new URL(import.meta.url).pathname), "../../../test-vectors/paper-v1");
const expectedPayload = await readFile(resolve(vectorDirectory, "payload.cbor"));
const expectedCose = await readFile(resolve(vectorDirectory, "cose-sign1.bin"));
const expectedTransport = (await readFile(resolve(vectorDirectory, "transport.txt"), "utf8")).trim();
const expectedQr = await readFile(resolve(vectorDirectory, "qr-512.png"));
const generated = await encodePaperSeal(vectorDescriptor, vectorSigner);
const generatedQr = await renderPaperSealQr(generated.transport, { width: 512 });
const trustStore = {
  resolve: async () => vectorKeyInfo,
  isTrusted: (keyInfo: typeof vectorKeyInfo) => keyInfo.keyId === vectorKeyInfo.keyId && keyInfo.issuerId === vectorKeyInfo.issuerId,
  trustSource: "paper-v1-golden-vector",
};
const verification = await verifyPaperSeal(generated.transport, { trustStore });

assertEqual(expectedPayload, generated.payload, "payload.cbor");
assertEqual(expectedCose, generated.cose, "cose-sign1.bin");
if (expectedTransport !== generated.transport) throw new Error("transport.txt does not match reproducible output");
assertEqual(expectedQr, generatedQr, "qr-512.png");
if (verification.verdict !== "VALID_TRUSTED") throw new Error(`golden vector verification returned ${verification.verdict}`);
console.log(JSON.stringify({
  status: "ok",
  payloadBytes: generated.payload.length,
  coseBytes: generated.cose.length,
  transportCharacters: generated.transport.length,
  verdict: verification.verdict,
}, null, 2));

function assertEqual(expected: Uint8Array, actual: Uint8Array, name: string): void {
  if (expected.length !== actual.length) throw new Error(`${name} length differs: ${expected.length} !== ${actual.length}`);
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== actual[index]) throw new Error(`${name} differs at byte ${index}`);
  }
}
