import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerificationResult } from "@credaryn/core";
import { VerificationInputError } from "@credaryn/verifier";
import { runCli, type CliDependencies } from "../src/main.js";

const pdfResult: VerificationResult = {
  verdict: "VALID_TRUSTED",
  cryptographicValidity: "VALID",
  trustDecision: "TRUSTED",
  lifecycleStatus: "UNCHECKED",
  issuerId: "acme-retail",
  keyId: "dss-demo-key",
  trustSource: "phase-4-test-trust",
  securityMode: "DIGITAL_ARTIFACT_SIGNED",
  artifactIntegrity: "VALID",
  evidence: [{ code: "PDF_VALID", message: "PDF cryptographic validity is valid" }],
};

const paperResult: VerificationResult = {
  verdict: "VALID_UNTRUSTED",
  cryptographicValidity: "VALID",
  trustDecision: "UNTRUSTED",
  lifecycleStatus: "UNCHECKED",
  issuerId: "acme-retail",
  keyId: "phase-2-vector",
  securityMode: "PAPER_CLAIMS_ONLY",
  artifactIntegrity: "NOT_APPLICABLE",
  signedClaims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
  evidence: [{ code: "PAPER_VALID", message: "Paper Seal cryptographic validity is valid" }],
};

describe("credaryn CLI contract", () => {
  it("runs every documented command with JSON output and stable exit codes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-cli-"));
    const inputPath = join(directory, "invoice.pdf");
    const descriptorPath = join(directory, "descriptor.json");
    const sealedPath = join(directory, "sealed.pdf");
    const paperPath = join(directory, "seal.crd1");
    const trustPath = join(directory, "dev-trust-store.json");
    await writeFile(inputPath, "%PDF-1.7\nfixture");
    await writeFile(descriptorPath, JSON.stringify({
      issuerId: "acme-retail",
      documentId: "INV-2026-82919",
      documentType: "invoice",
      issuedAt: "2026-01-01T00:00:00Z",
      claims: { currency: "INR", invoiceNumber: "INV-2026-82919", totalMinor: 1_180_000 },
    }));
    await writeFile(paperPath, "CRD1:!");

    const dependencies = createDependencies();
    const seal = await runCli(["seal", "pdf", inputPath, "--descriptor", descriptorPath, "--out", sealedPath], dependencies);
    expect(seal.exitCode).toBe(0);
    expect(JSON.parse(seal.stdout)).toMatchObject({ status: "sealed", output: sealedPath });
    await expect(readFile(sealedPath).then((bytes) => new Uint8Array(bytes))).resolves.toEqual(new Uint8Array([37, 80, 68, 70, 1]));

    const verify = await runCli(["verify", inputPath, "--trust", trustPath], dependencies);
    expect(verify.exitCode).toBe(0);
    expect(JSON.parse(verify.stdout)).toEqual(pdfResult);

    const paper = await runCli(["paper", "inspect", paperPath], dependencies);
    expect(paper.exitCode).toBe(0);
    expect(JSON.parse(paper.stdout)).toEqual(paperResult);

    const key = await runCli(["key", "inspect", join(directory, "missing-cert.pem")], dependencies);
    expect(key.exitCode).toBe(2);
    expect(JSON.parse(key.stdout)).toMatchObject({ error: { code: "INPUT_ERROR" } });

    const devCa = await runCli(["dev-ca", "init", "--out", trustPath], dependencies);
    expect(devCa.exitCode).toBe(0);
    expect(JSON.parse(devCa.stdout)).toMatchObject({
      status: "initialized",
      output: trustPath,
      trustSource: "local-development-only",
      developmentOnly: true,
    });
    await expect(readFile(trustPath, "utf8")).resolves.toMatch(/"developmentOnly": true/);
  });

  it("returns JSON argument errors with exit code 2", async () => {
    const result = await runCli(["verify"], createDependencies());

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: "ARGUMENT_ERROR" },
    });
  });

  it("returns JSON input errors with exit code 2", async () => {
    const directory = await mkdtemp(join(tmpdir(), "credaryn-cli-input-"));
    const inputPath = join(directory, "unknown.bin");
    await writeFile(inputPath, "unknown");
    const dependencies = createDependencies();
    dependencies.verifier = {
      ...dependencies.verifier,
      verifyInput: async () => {
        throw new VerificationInputError("UNKNOWN_INPUT", "Unable to identify the input");
      },
    };

    const result = await runCli(["verify", inputPath], dependencies);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: "UNKNOWN_INPUT" },
    });
  });
});

function createDependencies(): CliDependencies {
  return {
    sdk: {
      sealPdf: async () => new Uint8Array([37, 80, 68, 70, 1]),
    },
    verifier: {
      verifyInput: async ({ bytes }) => bytes[0] === 0x25 ? pdfResult : paperResult,
      verifyPdf: async () => pdfResult,
      verifyPaperText: async () => paperResult,
      verifyPaperImage: async () => paperResult,
    },
  };
}
