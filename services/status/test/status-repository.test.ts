import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  InMemoryStatusRepository,
  PostgresStatusRepository,
  type QueryExecutor,
} from "../src/index.js";

describe("InMemoryStatusRepository", () => {
  it("appends immutable history and projects the latest record", async () => {
    const repository = new InMemoryStatusRepository();
    await repository.append({ issuerId: "acme", documentId: "doc", status: "ACTIVE", reason: "issued", updatedAt: "2026-09-17T00:00:00.000Z" });
    await repository.append({ issuerId: "acme", documentId: "doc", status: "REVOKED", reason: "operator", updatedAt: "2026-09-17T01:00:00.000Z" });

    expect(await repository.current({ issuerId: "acme", documentId: "doc" })).toMatchObject({ status: "REVOKED" });
    expect(await repository.history({ issuerId: "acme", documentId: "doc" })).toHaveLength(2);
    expect(await repository.current({ issuerId: "acme", documentId: "other" })).toBeUndefined();
  });
});

describe("PostgresStatusRepository", () => {
  it("only inserts and reads document-scoped rows through the injected executor", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const executor: QueryExecutor = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    };
    const repository = new PostgresStatusRepository(executor);
    await repository.append({ issuerId: "acme", documentId: "doc", keyId: "key@1", status: "ACTIVE", reason: "issued", updatedAt: "2026-09-17T00:00:00.000Z" });

    expect(calls[0]?.sql).toContain("INSERT INTO credaryn_status_history");
    expect(calls[0]?.params).toEqual(["acme", "doc", "key@1", "ACTIVE", "issued", "2026-09-17T00:00:00.000Z"]);
    for (const call of calls) {
      expect(call.sql).not.toMatch(/\b(UPDATE|DELETE)\b/i);
    }
  });

  it("maps query rows to document-scoped records", async () => {
    const executor: QueryExecutor = {
      query: async (sql) => sql.includes("LIMIT")
        ? {
            rows: [{
              issuer_id: "acme",
              document_id: "doc",
              key_id: null,
              status: "REVOKED",
              reason: "operator",
              updated_at: new Date("2026-09-17T01:00:00.000Z"),
            }],
          }
        : { rows: [] },
    };
    const repository = new PostgresStatusRepository(executor);
    const current = await repository.current({ issuerId: "acme", documentId: "doc" });
    expect(current).toEqual({ issuerId: "acme", documentId: "doc", status: "REVOKED", reason: "operator", updatedAt: "2026-09-17T01:00:00.000Z" });
  });
});

describe("status schema", () => {
  it("is document-scoped and append-only", async () => {
    const schema = await readFile(fileURLToPath(new URL("../src/schema.sql", import.meta.url)), "utf8");
    expect(schema).toContain("document_id TEXT NOT NULL");
    expect(schema).not.toContain("PRIMARY KEY (issuer_id, key_id");
    expect(schema).toContain("BEFORE UPDATE OR DELETE ON credaryn_status_history");
    expect(schema).toContain("append-only");
  });
});
