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
      const paperSeal = await encodePaperSeal(descriptor, options.paperSigner);
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
