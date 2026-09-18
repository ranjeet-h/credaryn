import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createStatusHttpHandler, createStatusLogger, StatusService } from "../src/index.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function start(options: Parameters<typeof createStatusHttpHandler>[0]): Promise<string> {
  const server = createServer(createStatusHttpHandler(options));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("missing address");
  return `http://127.0.0.1:${address.port}`;
}

describe("status HTTP endpoint", () => {
  it("serves health, performs document-scoped transitions and reads the projection", async () => {
    const lines: string[] = [];
    const service = new StatusService({ now: () => "2026-09-17T00:00:00.000Z" });
    const base = await start({
      service,
      logger: createStatusLogger({ write: (line) => { lines.push(line); }, now: () => "2026-09-17T00:00:00.000Z" }),
      authorizeTransition: () => true,
    });

    expect(await (await fetch(`${base}/health`)).json()).toMatchObject({ status: "ready", service: "credaryn-status" });

    const transition = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issuerId: "acme-retail", documentId: "INV-1", keyId: "key@1", status: "ACTIVE", reason: "issued" }),
    });
    expect(transition.status).toBe(201);

    const lookup = await fetch(`${base}/v1/status?issuerId=acme-retail&documentId=INV-1`);
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toMatchObject({ lifecycleStatus: "ACTIVE", freshness: "FRESH", keyId: "key@1" });

    const badTransition = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issuerId: "acme-retail", documentId: "INV-1", status: "ACTIVE", reason: "again" }),
    });
    expect(badTransition.status).toBe(409);

    const acceptedLog = lines.map((line) => JSON.parse(line) as { message: string }).filter((entry) => entry.message === "status.transition.accepted");
    expect(acceptedLog).toHaveLength(1);
  });

  it("denies transitions when no authorization hook is wired", async () => {
    const service = new StatusService({ now: () => "2026-09-17T00:00:00.000Z" });
    const base = await start({ service, logger: createStatusLogger({ write: () => undefined }) });

    const denied = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued" }),
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: "STATUS_TRANSITION_FORBIDDEN" } });
  });

  it("rejects malformed references and payloads", async () => {
    const service = new StatusService({ now: () => "2026-09-17T00:00:00.000Z" });
    const base = await start({ service, authorizeTransition: () => true, logger: createStatusLogger({ write: () => undefined }) });

    expect((await fetch(`${base}/v1/status?issuerId=acme`)).status).toBe(400);

    const malformed = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issuerId: "acme", documentId: "doc", status: "NOPE", reason: "x" }),
    });
    expect(malformed.status).toBe(400);

    const notJson = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(notJson.status).toBe(400);
  });
});
