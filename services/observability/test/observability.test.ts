import { describe, expect, it } from "vitest";
import { createCorrelationId, createStructuredLog } from "../src/logging.js";

describe("observability redaction", () => {
  it("creates correlation IDs and removes credentials, private material, documents and sensitive preimages", () => {
    const correlationId = createCorrelationId(undefined);
    expect(correlationId).toMatch(/^[a-f0-9-]{36}$/);
    const log = createStructuredLog("info", "verification complete", {
      token: "secret-token",
      privateKey: "secret-key",
      uploadedDocument: "%PDF-private",
      rawPreimage: "sensitive",
      issuerId: "acme-retail",
      correlationId,
    });

    expect(log).toMatchObject({ level: "info", message: "verification complete", correlationId });
    expect(JSON.stringify(log)).not.toContain("secret-token");
    expect(JSON.stringify(log)).not.toContain("secret-key");
    expect(JSON.stringify(log)).not.toContain("%PDF-private");
    expect(log.fields.issuerId).toBe("acme-retail");
  });
});
