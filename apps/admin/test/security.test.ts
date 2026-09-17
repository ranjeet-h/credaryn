import { describe, expect, it } from "vitest";
import { authorizeAdmin, createSecureSessionCookie, validateCorsOrigin } from "../src/auth/oidc.js";
import { createAuditEvent } from "../src/audit.js";

describe("admin security boundaries", () => {
  it("requires OIDC claims, role and CSRF for mutations while keeping cookies secure", () => {
    expect(() => authorizeAdmin({ method: "POST", claims: undefined, csrfToken: "a", expectedCsrfToken: "a" })).toThrow(/authentication/i);
    expect(() => authorizeAdmin({ method: "POST", claims: { subject: "user", roles: ["viewer"] }, csrfToken: "a", expectedCsrfToken: "a" })).toThrow(/role/i);
    expect(() => authorizeAdmin({ method: "POST", claims: { subject: "user", roles: ["admin"] }, csrfToken: "a", expectedCsrfToken: "b" })).toThrow(/csrf/i);
    expect(authorizeAdmin({ method: "POST", claims: { subject: "user", roles: ["admin"] }, csrfToken: "a", expectedCsrfToken: "a" })).toMatchObject({ subject: "user", role: "admin" });
    expect(createSecureSessionCookie("session-id")).toContain("HttpOnly");
    expect(createSecureSessionCookie("session-id")).toContain("SameSite=Strict");
    expect(createSecureSessionCookie("session-id")).toContain("Secure");
  });

  it("allows only an explicitly configured CORS origin and redacts audit data", () => {
    expect(validateCorsOrigin("https://admin.example.test", ["https://admin.example.test"])).toBe(true);
    expect(validateCorsOrigin("https://evil.example.test", ["https://admin.example.test"])).toBe(false);
    const event = createAuditEvent({ actor: "user", action: "status.update", metadata: { accessToken: "secret", keyId: "issuer-key@v1" } });
    expect(event.metadata.accessToken).toBe("[REDACTED]");
    expect(event.metadata.keyId).toBe("issuer-key@v1");
  });
});
