import { describe, expect, it } from "vitest";
import {
  InMemoryStatusRepository,
  StatusService,
  StatusServiceUnavailableError,
  type StatusRecord,
} from "../src/index.js";

describe("StatusService", () => {
  it("keeps an append-only, document-scoped history while projecting the current status", async () => {
    const service = new StatusService({ now: () => "2026-09-17T00:00:00.000Z" });
    await service.transition({ issuerId: "acme-retail", documentId: "INV-2026-82919", keyId: "issuer-key@v1", status: "ACTIVE", reason: "issued" });
    await service.transition({ issuerId: "acme-retail", documentId: "INV-2026-82919", keyId: "issuer-key@v1", status: "REVOKED", reason: "operator request" });

    expect(await service.get({ issuerId: "acme-retail", documentId: "INV-2026-82919" })).toMatchObject({
      lifecycleStatus: "REVOKED",
      freshness: "FRESH",
      keyId: "issuer-key@v1",
    });
    const history = await service.history({ issuerId: "acme-retail", documentId: "INV-2026-82919" });
    expect(history).toHaveLength(2);
    expect(history[0]?.status).toBe("ACTIVE");

    // Status is document-scoped: another document under the same issuer does not inherit it.
    expect(await service.get({ issuerId: "acme-retail", documentId: "INV-OTHER" })).toMatchObject({
      lifecycleStatus: "UNCHECKED",
      freshness: "FRESH",
    });
  });

  it("requires a reason and rejects transitions that skip the ACTIVE state", async () => {
    const service = new StatusService({ now: () => "2026-09-17T00:00:00.000Z" });
    await expect(service.transition({ issuerId: "acme", documentId: "doc", status: "REVOKED", reason: "first" })).rejects.toThrow(/Invalid status transition/);

    await service.transition({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued" });
    await expect(service.transition({ issuerId: "acme", documentId: "doc", status: "EXPIRED", reason: "  " })).rejects.toThrow(/reason/);
    await service.transition({ issuerId: "acme", documentId: "doc", status: "REVOKED", reason: "operator" });
    await expect(service.transition({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "reissue" })).rejects.toThrow(/Invalid status transition/);
  });

  it("returns unchecked freshness when unavailable and can require fresh status", async () => {
    const service = new StatusService({ now: () => "2026-09-17T00:00:00.000Z", maxAgeMs: 1_000 });
    await service.transition({ issuerId: "acme-retail", documentId: "doc", status: "ACTIVE", reason: "issued" });
    service.setAvailable(false);

    expect(await service.get({ issuerId: "acme-retail", documentId: "doc" })).toMatchObject({ lifecycleStatus: "UNCHECKED", freshness: "UNAVAILABLE" });
    await expect(service.transition({ issuerId: "acme-retail", documentId: "doc", status: "REVOKED", reason: "operator request" })).rejects.toThrow(StatusServiceUnavailableError);

    service.setAvailable(true);
    let current = "2026-09-17T00:00:00.000Z";
    const stale = new StatusService({ now: () => current, maxAgeMs: 1_000 });
    await stale.transition({ issuerId: "acme-retail", documentId: "doc", status: "ACTIVE", reason: "issued" });
    current = "2026-09-17T00:00:10.000Z";
    expect(await stale.get({ issuerId: "acme-retail", documentId: "doc" }, { requireFreshness: true })).toMatchObject({
      lifecycleStatus: "UNCHECKED",
      freshness: "STALE",
    });
  });

  it("uses an injected repository so durability is a wiring decision", async () => {
    const records: StatusRecord[] = [];
    const repository = {
      append: async (record: StatusRecord) => { records.push(record); },
      current: async () => records.at(-1),
      history: async () => records,
    };
    const service = new StatusService({ repository, now: () => "2026-09-17T00:00:00.000Z" });
    await service.transition({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued" });
    expect(records).toHaveLength(1);
    expect(new InMemoryStatusRepository()).toBeInstanceOf(InMemoryStatusRepository);
  });
});
