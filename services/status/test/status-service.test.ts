import { describe, expect, it } from "vitest";
import { StatusService, StatusServiceUnavailableError } from "../src/status-service.js";

describe("StatusService", () => {
  it("keeps an append-only history while projecting the current status", () => {
    const service = new StatusService({ now: () => "2026-09-17T00:00:00.000Z" });
    service.transition({ issuerId: "acme-retail", keyId: "issuer-key@v1", status: "ACTIVE", reason: "issued" });
    service.transition({ issuerId: "acme-retail", keyId: "issuer-key@v1", status: "REVOKED", reason: "operator request" });

    expect(service.get("acme-retail", "issuer-key@v1")).toMatchObject({ lifecycleStatus: "REVOKED", freshness: "FRESH" });
    expect(service.history("acme-retail", "issuer-key@v1")).toHaveLength(2);
    expect(service.history("acme-retail", "issuer-key@v1")[0]?.status).toBe("ACTIVE");
  });

  it("returns unchecked freshness when unavailable and can require fresh status", () => {
    const service = new StatusService({ now: () => "2026-09-17T00:00:00.000Z", maxAgeMs: 1_000 });
    service.transition({ issuerId: "acme-retail", keyId: "issuer-key@v1", status: "ACTIVE", reason: "issued" });
    service.setAvailable(false);

    expect(service.get("acme-retail", "issuer-key@v1")).toMatchObject({ lifecycleStatus: "UNCHECKED", freshness: "UNAVAILABLE" });
    expect(() => service.transition({ issuerId: "acme-retail", keyId: "issuer-key@v1", status: "REVOKED", reason: "operator request" })).toThrow(StatusServiceUnavailableError);

    service.setAvailable(true);
    let current = "2026-09-17T00:00:00.000Z";
    const stale = new StatusService({ now: () => current, maxAgeMs: 1_000 });
    stale.transition({ issuerId: "acme-retail", keyId: "issuer-key@v1", status: "ACTIVE", reason: "issued" });
    current = "2026-09-17T00:00:10.000Z";
    expect(stale.get("acme-retail", "issuer-key@v1", { requireFreshness: true })).toMatchObject({ lifecycleStatus: "UNCHECKED", freshness: "STALE" });
  });
});
