import { createServer, type IncomingMessage, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createStatusHttpHandler, type StatusHttpOptions } from "./http.js";
import { createStatusLogger, type StatusLogger } from "./logger.js";
import { StatusService } from "./status-service.js";
import {
  createPgStatusRepository,
  type PgStatusRepository,
} from "./pg-repository.js";

export type StatusPersistence = "postgres" | "memory";

const PG_ENV_KEYS = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE"] as const;

export interface StatusDatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  sslMode?: string;
}

/**
 * Resolves the database connection from `DATABASE_URL` first, then from the standard `PG*`
 * environment variables. Returns `undefined` when neither is present, which selects the
 * in-memory repository for local development.
 */
export function statusDatabaseConfig(env: NodeJS.ProcessEnv = process.env): StatusDatabaseConfig | undefined {
  const url = env.DATABASE_URL?.trim();
  if (url !== undefined && url !== "") return { connectionString: url };
  const present = PG_ENV_KEYS.some((key) => {
    const value = env[key];
    return value !== undefined && value !== "";
  });
  if (!present) return undefined;
  const port = env.PGPORT?.trim();
  return {
    ...(env.PGHOST === undefined || env.PGHOST === "" ? {} : { host: env.PGHOST }),
    ...(port === undefined || port === "" ? {} : { port: Number.parseInt(port, 10) }),
    ...(env.PGUSER === undefined || env.PGUSER === "" ? {} : { user: env.PGUSER }),
    ...(env.PGPASSWORD === undefined || env.PGPASSWORD === "" ? {} : { password: env.PGPASSWORD }),
    ...(env.PGDATABASE === undefined || env.PGDATABASE === "" ? {} : { database: env.PGDATABASE }),
    ...(env.PGSSLMODE === undefined || env.PGSSLMODE === "" ? {} : { sslMode: env.PGSSLMODE }),
  };
}

export function statusPersistence(env: NodeJS.ProcessEnv = process.env): StatusPersistence {
  return statusDatabaseConfig(env) === undefined ? "memory" : "postgres";
}

export interface StatusRuntime {
  service: StatusService;
  persistence: StatusPersistence;
  close(): Promise<void>;
}

export interface StatusRuntimeDependencies {
  /** Override for tests or for an operator-managed connection pool. */
  createPgRepository?: (config: StatusDatabaseConfig) => Promise<PgStatusRepository>;
}

/**
 * Builds the status service for the current environment: the durable PostgreSQL repository when a
 * database is configured, otherwise the in-memory reference repository.
 */
export async function createStatusRuntime(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: StatusRuntimeDependencies = {},
): Promise<StatusRuntime> {
  const config = statusDatabaseConfig(env);
  if (config === undefined) {
    return { service: new StatusService(), persistence: "memory", close: async () => undefined };
  }
  const repository = await (dependencies.createPgRepository ?? createPgStatusRepository)(config);
  return {
    service: new StatusService({ repository }),
    persistence: "postgres",
    close: () => repository.close(),
  };
}

export function createStatusServer(options: StatusHttpOptions): Server {
  return createServer(createStatusHttpHandler(options));
}

export interface StartStatusServerOptions {
  env?: NodeJS.ProcessEnv;
  host?: string;
  port?: number;
  logger?: StatusLogger;
}

export interface StartedStatusServer {
  server: Server;
  runtime: StatusRuntime;
  close(): Promise<void>;
}

/**
 * Starts the HTTP status server: the existing {@link createStatusHttpHandler} over the repository
 * selected by the environment. Request bodies are bounded by the handler; logs are structured JSON
 * with redaction. Transition writes are enabled only when `STATUS_ADMIN_TOKEN` is set.
 */
export async function startStatusServer(options: StartStatusServerOptions = {}): Promise<StartedStatusServer> {
  const env = options.env ?? process.env;
  const logger = options.logger ?? createStatusLogger();
  const runtime = await createStatusRuntime(env);
  const adminToken = env.STATUS_ADMIN_TOKEN?.trim();
  const maxBodyBytes = parsePositiveInt(env.STATUS_MAX_BODY_BYTES);
  const handlerOptions: StatusHttpOptions = {
    service: runtime.service,
    logger,
    ...(adminToken === undefined || adminToken === ""
      ? {}
      : { authorizeTransition: (request: IncomingMessage) => bearerTokenMatches(request, adminToken) }),
    ...(maxBodyBytes === undefined ? {} : { maxBodyBytes }),
  };
  const server = createStatusServer(handlerOptions);
  const host = options.host ?? env.STATUS_HOST ?? "0.0.0.0";
  const port = options.port ?? parsePositiveInt(env.STATUS_PORT) ?? 4174;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  logger.info("status.listening", {
    host,
    port,
    persistence: runtime.persistence,
    writesEnabled: adminToken !== undefined && adminToken !== "",
  });

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await runtime.close();
  };
  return { server, runtime, close };
}

function bearerTokenMatches(request: IncomingMessage, expected: string): boolean {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || !value.startsWith("Bearer ")) return false;
  return safeEqual(value.slice("Bearer ".length).trim(), expected);
}

function safeEqual(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  if (candidateBytes.byteLength !== expectedBytes.byteLength) return false;
  return timingSafeEqual(candidateBytes, expectedBytes);
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const logger = createStatusLogger();
  const started = await startStatusServer({ logger });
  const shutdown = (signal: string): void => {
    logger.info("status.shutdown", { signal });
    void started.close().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error("status.shutdown.failed", { message: error instanceof Error ? error.message : "shutdown failed" });
        process.exit(1);
      },
    );
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
