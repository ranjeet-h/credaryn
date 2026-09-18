import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createJsonLogger } from "@credaryn/observability";
import type { OidcClaims } from "../src/auth/oidc.js";
import { createAdminServer, type AdminStatusRecord, type AdminStatusTransition } from "../src/server.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const TOKENS: Record<string, OidcClaims> = {
  "admin-token": { subject: "admin-user", roles: ["admin"] },
  "viewer-token": { subject: "viewer-user", roles: ["viewer"] },
  "signer-a": { subject: "signer-a", roles: ["signer"] },
};

const tokenVerifier = {
  verify: async (token: string): Promise<OidcClaims> => {
    const claims = TOKENS[token];
    if (claims === undefined) throw new Error("unknown token");
    return claims;
  },
};

function fakeRepository(): { repository: { transition(input: AdminStatusTransition): Promise<AdminStatusRecord>; get(reference: { issuerId: string; documentId: string }): Promise<AdminStatusRecord | undefined> }; records: Map<string, AdminStatusRecord> } {
  const records = new Map<string, AdminStatusRecord>();
  return {
    records,
    repository: {
      transition: async (input) => {
        const record: AdminStatusRecord = {
          issuerId: input.issuerId,
          documentId: input.documentId,
          ...(input.keyId === undefined ? {} : { keyId: input.keyId }),
          status: input.status,
          reason: input.reason,
          updatedAt: "2026-09-17T00:00:00.000Z",
        };
        records.set(`${input.issuerId}/${input.documentId}`, record);
        return record;
      },
      get: async (reference) => records.get(`${reference.issuerId}/${reference.documentId}`),
    },
  };
}

async function start(options: Parameters<typeof createAdminServer>[0]): Promise<string> {
  const server = createAdminServer(options);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("missing address");
  return `http://127.0.0.1:${address.port}`;
}

function silentLogger() {
  return createJsonLogger({ write: () => undefined, now: () => "2026-09-17T00:00:00.000Z" });
}

describe("admin HTTP surface", () => {
  it("serves health and enforces strict CORS", async () => {
    const { repository } = fakeRepository();
    const base = await start({ tokenVerifier, statusRepository: repository, allowedOrigins: ["https://admin.example.test"], logger: silentLogger() });

    expect(await (await fetch(`${base}/health`)).json()).toMatchObject({ status: "ready", service: "credaryn-admin" });

    const denied = await fetch(`${base}/health`, { headers: { origin: "https://evil.example.test" } });
    expect(denied.status).toBe(403);
  });

  it("fails closed with 501 when no OIDC verifier is configured", async () => {
    const { repository } = fakeRepository();
    const base = await start({ statusRepository: repository, allowedOrigins: [], env: {}, logger: silentLogger() });

    const response = await fetch(`${base}/v1/session`, { method: "POST" });
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ error: { code: "ADMIN_OIDC_NOT_CONFIGURED" } });
  });

  it("wires a real JWKS verifier from OIDC environment configuration", async () => {
    const { repository } = fakeRepository();
    const base = await start({
      statusRepository: repository,
      allowedOrigins: [],
      env: {
        CREDARYN_OIDC_ISSUER: "https://issuer.example.test",
        CREDARYN_OIDC_JWKS_URI: "https://issuer.example.test/.well-known/jwks.json",
      },
      logger: silentLogger(),
    });

    // A missing token yields 401 (not 501), proving the env-configured real verifier is active.
    const response = await fetch(`${base}/v1/session`, { method: "POST" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "ADMIN_AUTHENTICATION_REQUIRED" } });
  });

  it("requires an admin OIDC token and issues secure session + CSRF cookies", async () => {
    const { repository } = fakeRepository();
    const base = await start({ tokenVerifier, statusRepository: repository, allowedOrigins: [], logger: silentLogger() });

    expect((await fetch(`${base}/v1/session`, { method: "POST" })).status).toBe(401);
    expect((await fetch(`${base}/v1/session`, { method: "POST", headers: { authorization: "Bearer viewer-token" } })).status).toBe(403);

    const session = await fetch(`${base}/v1/session`, { method: "POST", headers: { authorization: "Bearer admin-token" } });
    expect(session.status).toBe(200);
    const cookies = (session.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const joined = cookies.join(";");
    expect(joined).toContain("credaryn_session=");
    expect(joined).toContain("HttpOnly");
    expect(joined).toContain("Secure");
    expect(joined).toContain("credaryn_csrf=");
  });

  it("guards status transitions with CSRF and returns the projection", async () => {
    const { repository } = fakeRepository();
    const audits: string[] = [];
    const base = await start({
      tokenVerifier,
      statusRepository: repository,
      allowedOrigins: [],
      logger: silentLogger(),
      auditSink: (event) => { audits.push(`${event.actor}:${event.action}`); },
    });

    const noCsrf = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
      body: JSON.stringify({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued" }),
    });
    expect(noCsrf.status).toBe(403);

    const transition = await fetch(`${base}/v1/status/transition`, {
      method: "POST",
      headers: {
        authorization: "Bearer admin-token",
        "content-type": "application/json",
        "x-csrf-token": "csrf-test",
        cookie: "credaryn_csrf=csrf-test",
      },
      body: JSON.stringify({ issuerId: "acme", documentId: "doc", keyId: "key@1", status: "ACTIVE", reason: "issued" }),
    });
    expect(transition.status).toBe(201);
    expect(await transition.json()).toMatchObject({ issuerId: "acme", documentId: "doc", status: "ACTIVE" });

    const read = await fetch(`${base}/v1/status/acme/doc`, { headers: { authorization: "Bearer admin-token" } });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ status: "ACTIVE" });
    expect(audits).toEqual(["admin-user:status.transition", "admin-user:status.read"]);
  });

  it("enforces least-privilege remote-signing scopes", async () => {
    const { repository } = fakeRepository();
    const base = await start({
      tokenVerifier,
      statusRepository: repository,
      allowedOrigins: [],
      signingScopes: [{ issuerId: "acme-retail", keyId: "issuer-key@v2" }],
      logger: silentLogger(),
    });

    const headers = {
      authorization: "Bearer signer-a",
      "content-type": "application/json",
      "x-csrf-token": "csrf-test",
      cookie: "credaryn_csrf=csrf-test",
    };
    const allowed = await fetch(`${base}/v1/signing/authorize`, {
      method: "POST",
      headers,
      body: JSON.stringify({ issuerId: "acme-retail", keyId: "issuer-key@v2" }),
    });
    expect(allowed.status).toBe(200);

    const wrongIssuer = await fetch(`${base}/v1/signing/authorize`, {
      method: "POST",
      headers,
      body: JSON.stringify({ issuerId: "other-issuer", keyId: "issuer-key@v2" }),
    });
    expect(wrongIssuer.status).toBe(403);
    expect(await wrongIssuer.json()).toMatchObject({ error: { code: "REMOTE_SIGNING_FORBIDDEN" } });

    const noSignerRole = await fetch(`${base}/v1/signing/authorize`, {
      method: "POST",
      headers: { ...headers, authorization: "Bearer admin-token" },
      body: JSON.stringify({ issuerId: "acme-retail", keyId: "issuer-key@v2" }),
    });
    expect(noSignerRole.status).toBe(403);
  });
});
