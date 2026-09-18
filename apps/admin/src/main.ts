import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { createJsonLogger } from "@credaryn/observability";
import {
  createAdminServer,
  type AdminStatusRecord,
  type AdminStatusRepository,
  type AdminStatusTransition,
} from "./server.js";

/**
 * Reference admin launcher for the optional `admin` Compose profile.
 *
 * It wires an in-memory lifecycle-status repository and lets `createAdminServer` build a real
 * OIDC/JWKS verifier from `CREDARYN_OIDC_ISSUER` + `CREDARYN_OIDC_JWKS_URI` (optional
 * `CREDARYN_OIDC_AUDIENCE`). With no OIDC configuration, authenticated routes fail closed with
 * 501. Operators replacing the in-memory store with `@credaryn/status` or their own repository
 * can import `createAdminServer` directly instead of this launcher.
 */
export function createInMemoryAdminStatusRepository(): AdminStatusRepository {
  const records = new Map<string, AdminStatusRecord>();
  const key = (issuerId: string, documentId: string): string => `${issuerId}\u0000${documentId}`;
  return {
    async transition(input: AdminStatusTransition): Promise<AdminStatusRecord> {
      const record: AdminStatusRecord = { ...input, updatedAt: new Date().toISOString() };
      records.set(key(input.issuerId, input.documentId), record);
      return record;
    },
    async get(reference: { issuerId: string; documentId: string }): Promise<AdminStatusRecord | undefined> {
      return records.get(key(reference.issuerId, reference.documentId));
    },
  };
}

export function startAdminServer(env: NodeJS.ProcessEnv = process.env): Server {
  const host = env.ADMIN_HOST ?? "127.0.0.1";
  const parsedPort = Number.parseInt(env.ADMIN_PORT ?? "4175", 10);
  const port = Number.isSafeInteger(parsedPort) && parsedPort > 0 ? parsedPort : 4175;
  const allowedOrigins = (env.CREDARYN_ADMIN_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
  const server = createAdminServer({
    statusRepository: createInMemoryAdminStatusRepository(),
    allowedOrigins,
    env,
  });
  server.listen(port, host, () => {
    createJsonLogger().info("admin.listening", {
      host,
      port,
      oidcConfigured: Boolean(env.CREDARYN_OIDC_ISSUER && env.CREDARYN_OIDC_JWKS_URI),
    });
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startAdminServer();
}
