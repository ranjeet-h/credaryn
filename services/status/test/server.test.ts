import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createStatusRuntime,
  createStatusLogger,
  startStatusServer,
  statusDatabaseConfig,
  statusPersistence,
  type PgStatusRepository,
  type StatusDatabaseConfig,
  type StatusRecord,
} from "../src/index.js";

const started: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(started.splice(0).map((close) => close()));
});

function silentLogger() {
  return createStatusLogger({ write: () => undefined, now: () => "2026-09-17T00:00:00.000Z" });
}

function fakePgRepository(): { repository: PgStatusRepository; closed: () => boolean; configs: StatusDatabaseConfig[] } {
  const records: StatusRecord[] = [];
  let closed = false;
  return {
    closed: () => closed,
    configs: [],
    repository: {
      append: async (record) => { records.push(record); },
      current: async () => records.at(-1),
      history: async () => records,
      close: async () => { closed = true; },
    },
  };
}

describe("status database selection", () => {
  it("uses DATABASE_URL when present, then PG* variables, otherwise memory", () => {
    expect(statusDatabaseConfig({})).toBeUndefined();
    expect(statusPersistence({})).toBe("memory");
    expect(statusDatabaseConfig({ DATABASE_URL: "postgresql://credaryn@db:5432/credaryn" })).toEqual({
      connectionString: "postgresql://credaryn@db:5432/credaryn",
    });
    expect(statusDatabaseConfig({ DATABASE_URL: "   " })).toBeUndefined();
    expect(statusDatabaseConfig({ PGHOST: "status-db", PGPORT: "5433", PGUSER: "credaryn", PGDATABASE: "credaryn", PGSSLMODE: "require" })).toEqual({
      host: "status-db",
      port: 5433,
      user: "credaryn",
      database: "credaryn",
      sslMode: "require",
    });
    expect(statusPersistence({ PGHOST: "status-db" })).toBe("postgres");
  });

  it("builds an in-memory runtime by default", async () => {
    const runtime = await createStatusRuntime({});
    expect(runtime.persistence).toBe("memory");
    await runtime.service.transition({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued" });
    expect(await runtime.service.get({ issuerId: "acme", documentId: "doc" })).toMatchObject({ lifecycleStatus: "ACTIVE" });
    await runtime.close();
  });

  it("builds a Postgres runtime and closes the repository", async () => {
    const created = fakePgRepository();
    let seen: StatusDatabaseConfig | undefined;
    const runtime = await createStatusRuntime(
      { DATABASE_URL: "postgresql://credaryn@status-db:5432/credaryn" },
      { createPgRepository: async (config) => { seen = config; return created.repository; } },
    );

    expect(runtime.persistence).toBe("postgres");
    expect(seen).toEqual({ connectionString: "postgresql://credaryn@status-db:5432/credaryn" });
    await runtime.service.transition({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued" });
    expect(await runtime.service.get({ issuerId: "acme", documentId: "doc" })).toMatchObject({ lifecycleStatus: "ACTIVE" });

    await runtime.close();
    expect(created.closed()).toBe(true);
  });
});

describe("status HTTP server", () => {
  it("serves health and denies transitions until a token is configured", async () => {
    const server = await startStatusServer({ env: {}, port: 0, logger: silentLogger() });
    started.push(() => server.close());
    const address = server.server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    expect(await (await fetch(`${base}/health`)).json()).toMatchObject({ status: "ready", service: "credaryn-status" });

    const denied = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued" }),
    });
    expect(denied.status).toBe(403);
  });

  it("accepts a transition when STATUS_ADMIN_TOKEN matches the bearer token", async () => {
    const server = await startStatusServer({ env: { STATUS_ADMIN_TOKEN: "admin-secret" }, port: 0, logger: silentLogger() });
    started.push(() => server.close());
    const address = server.server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const unauthorized = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued" }),
    });
    expect(unauthorized.status).toBe(403);

    const accepted = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer admin-secret" },
      body: JSON.stringify({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued" }),
    });
    expect(accepted.status).toBe(201);

    const lookup = await fetch(`${base}/v1/status?issuerId=acme&documentId=doc`);
    expect(await lookup.json()).toMatchObject({ lifecycleStatus: "ACTIVE" });
  });
});
