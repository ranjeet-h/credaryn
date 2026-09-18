import type { LifecycleStatus } from "@credaryn/core";

export type StatusState = Exclude<LifecycleStatus, "UNCHECKED">;
export type StatusFreshness = "FRESH" | "STALE" | "UNAVAILABLE";

export interface StatusReference {
  issuerId: string;
  documentId: string;
}

export interface StatusRecord {
  issuerId: string;
  documentId: string;
  keyId?: string;
  status: StatusState;
  reason: string;
  updatedAt: string;
}

export interface StatusTransitionInput {
  issuerId: string;
  documentId: string;
  keyId?: string;
  status: StatusState;
  reason: string;
}

/**
 * Document-scoped, append-only status store. Implementations must never overwrite or delete
 * history; the current status is the latest appended record for an issuer + document reference.
 */
export interface StatusRepository {
  append(record: StatusRecord): Promise<void>;
  current(reference: StatusReference): Promise<StatusRecord | undefined>;
  history(reference: StatusReference): Promise<readonly StatusRecord[]>;
}

export class InMemoryStatusRepository implements StatusRepository {
  private readonly currentRecords = new Map<string, StatusRecord>();
  private readonly historyRecords = new Map<string, StatusRecord[]>();

  async append(record: StatusRecord): Promise<void> {
    const key = reference(record.issuerId, record.documentId);
    this.currentRecords.set(key, clone(record));
    const history = this.historyRecords.get(key) ?? [];
    history.push(clone(record));
    this.historyRecords.set(key, history);
  }

  async current(reference: StatusReference): Promise<StatusRecord | undefined> {
    const record = this.currentRecords.get(referenceKey(reference));
    return record === undefined ? undefined : clone(record);
  }

  async history(reference: StatusReference): Promise<readonly StatusRecord[]> {
    return (this.historyRecords.get(referenceKey(reference)) ?? []).map(clone);
  }
}

export interface QueryResult {
  rows: Array<Record<string, unknown>>;
}

/** Minimal injected SQL executor; keeps the Postgres driver out of this package. */
export interface QueryExecutor {
  query(sql: string, params?: readonly unknown[]): Promise<QueryResult>;
}

const SELECT_COLUMNS = "issuer_id, document_id, key_id, status, reason, updated_at";

/**
 * Postgres-backed status repository driven by an injected query executor (for example a `pg`
 * Pool wrapped by the operator). History is append-only: this class only ever INSERTs and reads,
 * and `schema.sql` installs a trigger that rejects UPDATE/DELETE on the history table.
 */
export class PostgresStatusRepository implements StatusRepository {
  constructor(private readonly executor: QueryExecutor) {}

  async append(record: StatusRecord): Promise<void> {
    await this.executor.query(
      "INSERT INTO credaryn_status_history (issuer_id, document_id, key_id, status, reason, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [record.issuerId, record.documentId, record.keyId ?? null, record.status, record.reason, record.updatedAt],
    );
  }

  async current(reference: StatusReference): Promise<StatusRecord | undefined> {
    const result = await this.executor.query(
      `SELECT ${SELECT_COLUMNS} FROM credaryn_status_history WHERE issuer_id = $1 AND document_id = $2 ORDER BY updated_at DESC LIMIT 1`,
      [reference.issuerId, reference.documentId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : rowToRecord(row);
  }

  async history(reference: StatusReference): Promise<readonly StatusRecord[]> {
    const result = await this.executor.query(
      `SELECT ${SELECT_COLUMNS} FROM credaryn_status_history WHERE issuer_id = $1 AND document_id = $2 ORDER BY updated_at ASC`,
      [reference.issuerId, reference.documentId],
    );
    return result.rows.map(rowToRecord);
  }
}

export function statusReferenceKey(reference: StatusReference): string {
  return `${reference.issuerId}\u0000${reference.documentId}`;
}

function reference(issuerId: string, documentId: string): string {
  return statusReferenceKey({ issuerId, documentId });
}

function referenceKey(reference: StatusReference): string {
  return statusReferenceKey(reference);
}

function rowToRecord(row: Record<string, unknown>): StatusRecord {
  const keyId = row.key_id;
  return {
    issuerId: String(row.issuer_id),
    documentId: String(row.document_id),
    ...(keyId === null || keyId === undefined ? {} : { keyId: String(keyId) }),
    status: String(row.status) as StatusState,
    reason: String(row.reason),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function clone(record: StatusRecord): StatusRecord {
  return { ...record };
}
