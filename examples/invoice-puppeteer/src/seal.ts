import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DocumentDescriptor, SignerKeyInfo, SignerProvider, VerificationResult } from "@credaryn/core";
import { encodePaperSeal, renderPaperSealQr, verifyPaperSeal } from "@credaryn/paper";
import { createPdfPipeline, isArtifactIntegrityValid, type SealedPdfPipelineResult } from "@credaryn/pdf";
import { LocalSigner } from "@credaryn/provider-local";
import { DemoTrustStore } from "@credaryn/provider-local/demo-trust-store";
import { DssPdfSignatureEngine } from "@credaryn/adapter-pades-dss";
import { renderInvoicePdf } from "./render.js";

const fixtureUrl = new URL("./fixtures/invoice-11800.json", import.meta.url);
const vectorDirectoryUrl = new URL("../../../test-vectors/pdf/", import.meta.url);
const artifactDirectoryUrl = new URL("../../../artifacts/invoice-11800/", import.meta.url);

interface InvoiceFixtureFile {
  descriptor: DocumentDescriptor;
}

export interface InvoiceFixture {
  descriptor: DocumentDescriptor;
  paperSigner: LocalSigner;
  paperSealTransport: string;
}

export interface InvoiceArtifacts extends SealedPdfPipelineResult {
  paperVerification: VerificationResult;
  pdfVerification: Awaited<ReturnType<DssPdfSignatureEngine["verify"]>>;
}

export async function loadInvoiceFixture(): Promise<InvoiceFixture> {
  const source = JSON.parse(await readFile(fixtureUrl, "utf8")) as InvoiceFixtureFile;
  const paperSigner = new LocalSigner({ issuerId: source.descriptor.issuerId, keyId: "paper-demo-key" });
  const paperSeal = await encodePaperSeal(source.descriptor, paperSigner);
  return {
    descriptor: source.descriptor,
    paperSigner,
    paperSealTransport: paperSeal.transport,
  };
}

export async function createInvoiceArtifacts(endpoint = process.env.DSS_URL ?? "http://127.0.0.1:8080"): Promise<InvoiceArtifacts> {
  const fixture = await loadInvoiceFixture();
  const pdfSigner = createDssSignerIdentity();
  const pdfEngine = new DssPdfSignatureEngine({ endpoint });
  const pipeline = createPdfPipeline({
    paperSigner: fixture.paperSigner,
    pdfSigner,
    pdfEngine,
    renderInvoice: async (descriptor, paperSeal) => renderInvoicePdf(descriptor, paperSeal.transport),
    placePaperSeal: async (pdfBytes, transport) => placePaperSealBeforeSigning(pdfBytes, transport),
  });
  const result = await pipeline.seal(fixture.descriptor);
  const paperKey = await fixture.paperSigner.getKeyInfo();
  const paperVerification = await verifyPaperSeal(result.paperSeal.transport, {
    trustStore: new DemoTrustStore([paperKey]),
  });
  const pdfVerification = await pdfEngine.verify(result.signedPdf, { trustStore: new DemoTrustStore([]) });
  return { ...result, paperVerification, pdfVerification };
}

export function placePaperSealBeforeSigning(pdfBytes: Uint8Array, transport: string): Uint8Array {
  if (!(pdfBytes instanceof Uint8Array) || pdfBytes.byteLength === 0) throw new Error("Rendered invoice PDF must contain bytes");
  if (!transport.startsWith("CRD1:")) throw new Error("Paper Seal transport must start with CRD1:");
  if (pdfBytes[0] !== 0x25 || pdfBytes[1] !== 0x50 || pdfBytes[2] !== 0x44 || pdfBytes[3] !== 0x46) {
    throw new Error("Rendered invoice must be a PDF before paper-seal placement");
  }
  // The controlled renderer materializes the QR and human-readable seal in the
  // HTML before producing these bytes. This boundary makes that ordering
  // explicit and prevents the signer from receiving the pre-seal render.
  return new Uint8Array(pdfBytes);
}

export function mutatePdfBytes(pdfBytes: Uint8Array): Uint8Array {
  if (pdfBytes.byteLength < 32) throw new Error("PDF fixture is too small to mutate safely");
  const mutated = new Uint8Array(pdfBytes);
  const index = Math.min(mutated.byteLength - 1, Math.max(16, Math.floor(mutated.byteLength / 2)));
  mutated[index] = mutated[index]! ^ 0x01;
  return mutated;
}

export function mutatePdfContentBytes(pdfBytes: Uint8Array): Uint8Array {
  return mutateMarkedByte(pdfBytes, "Credaryn Paper Seal QR Code");
}

export function mutatePdfMetadataBytes(pdfBytes: Uint8Array): Uint8Array {
  return mutateMarkedByte(pdfBytes, "/Producer (");
}

export async function writeGeneratedArtifacts(result: InvoiceArtifacts): Promise<void> {
  const artifactDirectory = fileURLToPath(artifactDirectoryUrl);
  const vectorDirectory = fileURLToPath(vectorDirectoryUrl);
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(vectorDirectory, { recursive: true });
  await Promise.all([
    writeFile(`${artifactDirectory}/sealed.pdf`, result.signedPdf),
    writeFile(`${artifactDirectory}/unsigned-with-paper-seal.pdf`, result.unsignedPdf),
    writeFile(`${artifactDirectory}/paper-seal.txt`, result.paperSeal.transport, "utf8"),
    writeFile(`${artifactDirectory}/paper-seal.png`, await renderPaperSealQr(result.paperSeal.transport, { width: 512 }),),
    writeFile(`${artifactDirectory}/artifact-digest.txt`, `${result.artifactDigest}\n`, "utf8"),
    writeFile(`${vectorDirectory}/invoice-11800.pdf`, result.signedPdf),
  ]);
}

export async function writeMutatedFixture(pdfBytes: Uint8Array): Promise<void> {
  const artifactDirectory = fileURLToPath(artifactDirectoryUrl);
  const vectorDirectory = fileURLToPath(vectorDirectoryUrl);
  const mutated = mutatePdfBytes(pdfBytes);
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(vectorDirectory, { recursive: true });
  await Promise.all([
    writeFile(`${artifactDirectory}/mutated.pdf`, mutated),
    writeFile(`${vectorDirectory}/invoice-11800-mutated.pdf`, mutated),
  ]);
}

export async function verifyFixtureFiles(endpoint = process.env.DSS_URL ?? "http://127.0.0.1:8080"): Promise<void> {
  const fixture = await loadInvoiceFixture();
  const signedPdf = new Uint8Array(await readFile(new URL("../../../test-vectors/pdf/invoice-11800.pdf", import.meta.url)));
  const mutatedPdf = new Uint8Array(await readFile(new URL("../../../test-vectors/pdf/invoice-11800-mutated.pdf", import.meta.url)));
  const engine = new DssPdfSignatureEngine({ endpoint });
  const pdfVerification = await engine.verify(signedPdf, { trustStore: new DemoTrustStore([]) });
  const mutatedVerification = await engine.verify(mutatedPdf, { trustStore: new DemoTrustStore([]) });
  const paperKey = await fixture.paperSigner.getKeyInfo();
  const paperVerification = await verifyPaperSeal(fixture.paperSealTransport, { trustStore: new DemoTrustStore([paperKey]) });

  if (!isArtifactIntegrityValid(pdfVerification)) throw new Error(`Original PDF did not validate: ${JSON.stringify(pdfVerification)}`);
  if (mutatedVerification.artifactIntegrity === "VALID") throw new Error(`Mutated PDF unexpectedly validated: ${JSON.stringify(mutatedVerification)}`);
  if (paperVerification.verdict !== "VALID_TRUSTED") throw new Error(`Paper Seal did not validate as trusted: ${JSON.stringify(paperVerification)}`);
  console.log(JSON.stringify({ pdfVerification, mutatedVerification, paperVerification }, null, 2));
}

function createDssSignerIdentity(): SignerProvider {
  const keyInfo: SignerKeyInfo = {
    issuerId: "acme-retail",
    keyId: "dss-demo-key",
    algorithm: "ES256",
    publicKey: new Uint8Array(),
  };
  return {
    getKeyInfo: async () => ({ ...keyInfo, publicKey: new Uint8Array(keyInfo.publicKey) }),
    sign: async () => {
      throw new Error("DSS owns the PDF private key; application code cannot sign locally");
    },
  };
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "generate") {
    const result = await createInvoiceArtifacts();
    await writeGeneratedArtifacts(result);
    await writeMutatedFixture(result.signedPdf);
    console.log(JSON.stringify({
      artifactDigest: result.artifactDigest,
      paperVerification: result.paperVerification,
      pdfVerification: result.pdfVerification,
    }, null, 2));
    return;
  }
  if (command === "mutate") {
    const signedPdf = new Uint8Array(await readFile(new URL("../../../test-vectors/pdf/invoice-11800.pdf", import.meta.url)));
    await writeMutatedFixture(signedPdf);
    console.log("Wrote mutated invoice PDF fixtures.");
    return;
  }
  if (command === "verify-fixtures") {
    await verifyFixtureFiles();
    return;
  }
  throw new Error("Usage: seal.ts <generate|mutate|verify-fixtures>");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

export function sha256(pdfBytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(pdfBytes).digest("hex")}`;
}

function mutateMarkedByte(pdfBytes: Uint8Array, marker: string): Uint8Array {
  const index = Buffer.from(pdfBytes).indexOf(Buffer.from(marker, "utf8"));
  if (index < 0) throw new Error(`PDF fixture does not contain the expected ${marker} marker`);
  const markerLength = Buffer.byteLength(marker, "utf8");
  const mutationIndex = index + (marker.endsWith("(") ? markerLength : markerLength - 1);
  if (mutationIndex >= pdfBytes.byteLength || pdfBytes[mutationIndex] === 0x29) {
    throw new Error(`PDF fixture marker ${marker} has no mutable byte`);
  }
  const mutated = new Uint8Array(pdfBytes);
  mutated[mutationIndex] = mutated[mutationIndex]! ^ 0x01;
  return mutated;
}
