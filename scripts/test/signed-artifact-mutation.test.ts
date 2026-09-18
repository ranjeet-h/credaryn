import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Regression for M-002 C1: the package-level mutation tests exercised the unsigned
// PDF. This test loads the sealed fixture itself and proves post-signing mutation is
// rejected by the reference DSS engine. It is skipped when DSS is not running so the
// default test suite stays runnable without the Java sidecar.
//
// The DSS HTTP contract is used directly (rather than importing a workspace package)
// so this script-level regression has no dependency on the root package manifest.
const dssEndpoint = (process.env.DSS_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const sealedFixture = new URL("../../test-vectors/pdf/invoice-11800.pdf", import.meta.url);
const mutatedFixture = new URL("../../test-vectors/pdf/invoice-11800-mutated.pdf", import.meta.url);

interface DssVerifyResponse {
  cryptographicValidity?: string;
  artifactIntegrity?: string;
  signatureLevel?: string;
}

async function dssIsReady(): Promise<boolean> {
  try {
    const response = await fetch(`${dssEndpoint}/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: string };
    return body.status === "ready";
  } catch {
    return false;
  }
}

async function dssVerify(pdf: Uint8Array): Promise<DssVerifyResponse> {
  const response = await fetch(`${dssEndpoint}/v1/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ operation: "verify", pdfBase64: Buffer.from(pdf).toString("base64") }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`DSS /v1/verify returned HTTP ${response.status}`);
  return (await response.json()) as DssVerifyResponse;
}

describe("sealed fixture mutation evidence", () => {
  it("the mutated fixture is a distinct byte sequence from the sealed fixture", async () => {
    const sealed = await readFile(sealedFixture);
    const mutated = await readFile(mutatedFixture);
    expect(mutated.equals(sealed)).toBe(false);
    console.log(`sealed fixture bytes: ${sealed.length}, mutated fixture bytes: ${mutated.length}`);
    console.log("sealed fixture sha256:", createHash("sha256").update(sealed).digest("hex"));
    console.log("mutated fixture sha256:", createHash("sha256").update(mutated).digest("hex"));
  });
});

const describeWithDss = (await dssIsReady()) ? describe : describe.skip;

describeWithDss("DSS rejects post-signing PDF mutation", () => {
  it("accepts the sealed artifact and rejects the sealed artifact after mutation", async () => {
    const sealed = new Uint8Array(await readFile(sealedFixture));
    const mutated = new Uint8Array(await readFile(mutatedFixture));

    const original = await dssVerify(sealed);
    const changed = await dssVerify(mutated);

    expect(original).toMatchObject({ cryptographicValidity: "VALID", artifactIntegrity: "VALID" });
    expect(changed).toMatchObject({ cryptographicValidity: "INVALID", artifactIntegrity: "INVALID" });
  });
});
