import { createHash } from "node:crypto";
import type { DocumentDescriptor, SignerProvider } from "@credaryn/core";
import {
  encodePaperSeal,
  type PaperSealEncoding,
} from "@credaryn/paper";
import type { PdfSignatureEngine } from "./engine.js";

export interface PdfPipelineOptions {
  paperSigner: SignerProvider;
  pdfSigner?: SignerProvider;
  pdfEngine: PdfSignatureEngine;
  /**
   * Optional caller-supplied reference digest (for example the digest of a prior
   * unsigned render or an external registry/status record) to embed in the Paper
   * Seal as `digitalArtifactDigest` before placement.
   *
   * The digest of the artifact that *contains* this seal cannot be embedded here:
   * the seal is produced before that artifact exists, so its digest is not yet
   * knowable. Linking the paper seal to its own enclosing artifact therefore
   * requires the digest to live outside the seal (a status/registry record or a
   * second-pass attestation). This option is for linking to a *different*,
   * already-known artifact.
   */
  linkedArtifactDigest?: string;
  renderInvoice(descriptor: DocumentDescriptor, paperSeal: PaperSealEncoding): Promise<Uint8Array>;
  placePaperSeal(pdfBytes: Uint8Array, transport: string): Promise<Uint8Array>;
}

export interface SealedPdfPipelineResult {
  unsignedPdf: Uint8Array;
  signedPdf: Uint8Array;
  paperSeal: PaperSealEncoding;
  artifactDigest: string;
}

export interface PdfPipeline {
  seal(descriptor: DocumentDescriptor): Promise<SealedPdfPipelineResult>;
}

export function createPdfPipeline(options: PdfPipelineOptions): PdfPipeline {
  return {
    async seal(descriptor) {
      // The digest of the artifact that contains this seal cannot be embedded: the
      // seal is placed into the PDF before signing, so the resulting signed artifact
      // already contains the seal and its digest only exists afterwards. Embedding it
      // would be circular. When the caller already knows a digest for a *different*
      // artifact (a prior render, a status/registry record), `linkedArtifactDigest`
      // carries that reference through as the seal's `digitalArtifactDigest`.
      const paperSeal = await encodePaperSeal(
        descriptor,
        options.paperSigner,
        options.linkedArtifactDigest === undefined
          ? {}
          : { digitalArtifactDigest: options.linkedArtifactDigest },
      );
      const renderedPdf = await options.renderInvoice(descriptor, paperSeal);
      const unsignedPdf = await options.placePaperSeal(renderedPdf, paperSeal.transport);
      const artifactDigest = `sha256:${createHash("sha256").update(unsignedPdf).digest("hex")}`;
      const signedPdf = await options.pdfEngine.sign(unsignedPdf, {
        signer: options.pdfSigner ?? options.paperSigner,
        level: "B-B",
        artifactDigest,
      });
      return { unsignedPdf, signedPdf, paperSeal, artifactDigest };
    },
  };
}
