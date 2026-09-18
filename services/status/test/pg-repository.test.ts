import { describe, expect, it } from "vitest";
import {
  applyStatusSchema,
  createPgQueryExecutor,
  createPgStatusRepository,
  type PgPoolLike,
} from "../src/index.js";

interface QueryCall {
  sql: string;
  params: readonly unknown[] | undefined;
}

class FakePool implements PgPoolLike {
  readonly calls: QueryCall[] = [];
  readonly rowsBySelector: Array<{ match: RegExp; rows: Array<Record<string, unknown>> }> = [];
  ended = false;

  async query(text: string, values?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> {
    this.calls.push({ sql: text, params: values });
    const selected = this.rowsBySelector.find((entry) => entry.match.test(text));
    return { rows: selected?.rows ?? [] };
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}

const currentRow: Record<string, unknown> = {
  issuer_id: "acme-retail",
  document_id: "INV-1",
  key_id: "issuer-key@v1",
  status: "REVOKED",
  reason: "operator",
  updated_at: new Date("2026-09-17T01:00:00.000Z"),
};

describe("createPgQueryExecutor", () => {
  it("forwards parameters and clones returned rows", async () => {
    const calls: QueryCall[] = [];
    const pool: PgPoolLike = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [{ status: "ACTIVE" }] };
      },
    };
    const executor = createPgQueryExecutor(pool);

    const result = await executor.query("SELECT $1", ["acme"]);
    expect(calls[0]).toEqual({ sql: "SELECT $1", params: ["acme"] });
    expect(result.rows[0]).toEqual({ status: "ACTIVE" });

    await executor.query("SELECT 1");
    expect(calls[1]?.params).toBeUndefined();
  });
});

describe("applyStatusSchema", () => {
  it("executes the idempotent append-only schema", async () => {
    const calls: string[] = [];
    const recording = {
      query: async (sql: string): Promise<{ rows: Array<Record<string, unknown>> }> => {
        calls.push(sql);
        return { rows: [] };
      },
    };

    await applyStatusSchema(recording);

    expect(calls[0]).toContain("CREATE TABLE IF NOT EXISTS credaryn_status_history");
    expect(calls[0]).toContain("BEFORE UPDATE OR DELETE ON credaryn_status_history");
    expect(calls[0]).toContain("append-only");
  });
});

describe("createPgStatusRepository", () => {
  it("applies the schema on init and delegates append/current/history to the pool", async () => {
    const pool = new FakePool();
    pool.rowsBySelector.push({ match: /LIMIT 1/, rows: [currentRow] });
    const repository = await createPgStatusRepository({ pool });

    expect(pool.calls[0]?.sql).toContain("CREATE TABLE IF NOT EXISTS credaryn_status_history");

    await repository.append({
      issuerId: "acme-retail",
      documentId: "INV-1",
      keyId: "issuer-key@v1",
      status: "ACTIVE",
      reason: "issued",
      updatedAt: "2026-09-17T00:00:00.000Z",
    });
    const insert = pool.calls.find((call) => call.sql.includes("INSERT INTO"));
    expect(insert?.sql).toContain("INSERT INTO credaryn_status_history");
    expect(insert?.params).toEqual(["acme-retail", "INV-1", "issuer-key@v1", "ACTIVE", "issued", "2026-09-17T00:00:00.000Z"]);

    const current = await repository.current({ issuerId: "acme-retail", documentId: "INV-1" });
    expect(current).toEqual({
      issuerId: "acme-retail",
      documentId: "INV-1",
      keyId: "issuer-key@v1",
      status: "REVOKED",
      reason: "operator",
      updatedAt: "2026-09-17T01:00:00.000Z",
    });

    await repository.history({ issuerId: "acme-retail", documentId: "INV-1" });
    // The schema legitimately names UPDATE/DELETE in its append-only trigger; repository
    // operations after init must only read or insert.
    for (const call of pool.calls.slice(1)) {
      expect(call.sql).not.toMatch(/\b(UPDATE|DELETE)\b/i);
    }

    await repository.close();
    expect(pool.ended).toBe(true);
  });

  it("skips schema application when disabled", async () => {
    const pool = new FakePool();
    await createPgStatusRepository({ pool, applySchema: false });
    expect(pool.calls).toHaveLength(0);
  });
});
