import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { encodePaperSeal, renderPaperSealQr } from "../src/index.js";
import { vectorDescriptor, vectorSigner } from "./vector-fixture.js";

const outputDirectory = resolve(dirname(new URL(import.meta.url).pathname), "../../../test-vectors/paper-v1");
const seal = await encodePaperSeal(vectorDescriptor, vectorSigner);
const qr = await renderPaperSealQr(seal.transport, { width: 512 });

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "payload.cbor"), seal.payload);
await writeFile(resolve(outputDirectory, "cose-sign1.bin"), seal.cose);
await writeFile(resolve(outputDirectory, "transport.txt"), `${seal.transport}\n`);
await writeFile(resolve(outputDirectory, "qr-512.png"), qr);
console.log(JSON.stringify({
  outputDirectory,
  payloadBytes: seal.payload.length,
  coseBytes: seal.cose.length,
  transportCharacters: seal.transport.length,
  qrBytes: qr.length,
}, null, 2));
