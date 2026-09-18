import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  PostgresStatusRepository,
  type QueryExecutor,
  type StatusRepository,
} from "./status-repository.js";

/**
 * The subset of a `pg.Pool`/`pg.Client` this module needs. Declaring it locally keeps the
 * repository unit-testable with a fake pool and keeps the `pg` import out of the module graph
 * until a real pool is actually created.
 */
export interface PgPoolLike {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end?(): Promise<void>;
}

export interface PgConnectionOptions {
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  /** PostgreSQL `sslmode`-style value; `require`/`verify-ca`/`verify-full` enable TLS. */
  sslMode?: string;
  max?: number;
}

export interface PgStatusRepositoryOptions extends PgConnectionOptions {
  /**
   * Injected pool. When omitted a `pg.Pool` is created from the connection options. Tests and
   * operators that already own a pool (or a proxy such as pgbouncer) pass one here.
   */
  pool?: PgPoolLike;
  /** Apply `schema.sql` on creation. Default `true`; the schema is idempotent. */
  applySchema?: boolean;
}

/** A {@link StatusRepository} that owns its connection pool and can be closed on shutdown. */
export interface PgStatusRepository extends StatusRepository {
  close(): Promise<void>;
}

/** Wraps a `pg` pool/client in the driver-free {@link QueryExecutor} contract. */
export function createPgQueryExecutor(pool: PgPoolLike): QueryExecutor {
  return {
    query: async (sql, params) => {
      const result = params === undefined ? await pool.query(sql) : await pool.query(sql, params);
      return { rows: result.rows.map((row) => ({ ...row })) };
    },
  };
}

/** Applies the idempotent document-scoped, append-only schema from `schema.sql`. */
export async function applyStatusSchema(executor: QueryExecutor): Promise<void> {
  const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));
  const schema = await readFile(schemaPath, "utf8");
  // No parameters: node-postgres uses the simple query protocol, which accepts the whole
  // multi-statement file (including the `$$`-quoted trigger function).
  await executor.query(schema);
}

/**
 * Builds a durable, document-scoped, append-only status repository backed by PostgreSQL. The
 * schema is applied on init; the repository only ever INSERTs and SELECTs, and the schema trigger
 * rejects in-place UPDATE/DELETE, preserving the same semantics as {@link InMemoryStatusRepository}.
 */
export async function createPgStatusRepository(
  options: PgStatusRepositoryOptions = {},
): Promise<PgStatusRepository> {
  const pool = options.pool ?? await createPgPool(options);
  const executor = createPgQueryExecutor(pool);
  if (options.applySchema ?? true) await applyStatusSchema(executor);
  const repository = new PostgresStatusRepository(executor);
  return {
    append: (record) => repository.append(record),
    current: (reference) => repository.current(reference),
    history: (reference) => repository.history(reference),
    close: async () => { await pool.end?.(); },
  };
}

async function createPgPool(options: PgStatusRepositoryOptions): Promise<PgPoolLike> {
  // Imported lazily so consumers that only need the HTTP resolver never load the driver.
  const { Pool } = await import("pg");
  const ssl = sslForMode(options.sslMode);
  const pool = new Pool({
    ...(options.connectionString === undefined ? {} : { connectionString: options.connectionString }),
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.user === undefined ? {} : { user: options.user }),
    ...(options.password === undefined ? {} : { password: options.password }),
    ...(options.database === undefined ? {} : { database: options.database }),
    ...(ssl === undefined ? {} : { ssl }),
    max: options.max ?? 10,
  });
  return pool as unknown as PgPoolLike;
}

function sslForMode(sslMode: string | undefined): boolean | undefined {
  if (sslMode === undefined) return undefined;
  const mode = sslMode.trim().toLowerCase();
  if (mode === "require" || mode === "verify-ca" || mode === "verify-full") return true;
  return undefined;
}
