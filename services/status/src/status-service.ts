import type { LifecycleStatus } from "@credaryn/core";
import {
  InMemoryStatusRepository,
  type StatusFreshness,
  type StatusRecord,
  type StatusReference,
  type StatusRepository,
  type StatusState,
  type StatusTransitionInput,
} from "./status-repository.js";

export type { StatusFreshness, StatusRecord, StatusReference, StatusRepository, StatusState, StatusTransitionInput } from "./status-repository.js";
export { InMemoryStatusRepository, PostgresStatusRepository, statusReferenceKey } from "./status-repository.js";
export type { QueryExecutor, QueryResult } from "./status-repository.js";

export interface StatusLookup {
  issuerId: string;
  documentId: string;
  keyId?: string;
  lifecycleStatus: LifecycleStatus;
  freshness: StatusFreshness;
  record?: StatusRecord;
}

export class StatusServiceUnavailableError extends Error {
  constructor() {
    super("Status service is unavailable");
    this.name = "StatusServiceUnavailableError";
  }
}

export interface StatusServiceOptions {
  repository?: StatusRepository;
  now?: () => string;
  maxAgeMs?: number;
  available?: boolean;
}

/**
 * Document-scoped lifecycle status service. Operational status is kept separate from the
 * immutable issuance signature and stored append-only through a {@link StatusRepository}.
 */
export class StatusService {
  private readonly repository: StatusRepository;
  private readonly now: () => string;
  private readonly maxAgeMs: number;
  private available: boolean;

  constructor(options: StatusServiceOptions = {}) {
    this.repository = options.repository ?? new InMemoryStatusRepository();
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1000;
    this.available = options.available ?? true;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  async transition(input: StatusTransitionInput): Promise<StatusRecord> {
    if (!this.available) throw new StatusServiceUnavailableError();
    if (input.reason.trim() === "") throw new Error("Status transitions require a reason");
    const reference: StatusReference = { issuerId: input.issuerId, documentId: input.documentId };
    const previous = await this.repository.current(reference);
    if (!isAllowed(previous?.status, input.status)) {
      throw new Error(`Invalid status transition from ${previous?.status ?? "NONE"} to ${input.status}`);
    }
    const record: StatusRecord = {
      issuerId: input.issuerId,
      documentId: input.documentId,
      ...(input.keyId === undefined ? {} : { keyId: input.keyId }),
      status: input.status,
      reason: input.reason,
      updatedAt: this.now(),
    };
    await this.repository.append(record);
    return clone(record);
  }

  async get(reference: StatusReference, options: { requireFreshness?: boolean } = {}): Promise<StatusLookup> {
    const base = {
      issuerId: reference.issuerId,
      documentId: reference.documentId,
      lifecycleStatus: "UNCHECKED" as LifecycleStatus,
      freshness: "UNAVAILABLE" as StatusFreshness,
    };
    if (!this.available) return base;
    const record = await this.repository.current(reference);
    if (record === undefined) return { ...base, freshness: "FRESH" };
    const age = Date.parse(this.now()) - Date.parse(record.updatedAt);
    const freshness: StatusFreshness = Number.isFinite(age) && age > this.maxAgeMs ? "STALE" : "FRESH";
    return {
      ...base,
      ...(record.keyId === undefined ? {} : { keyId: record.keyId }),
      lifecycleStatus: options.requireFreshness && freshness !== "FRESH" ? "UNCHECKED" : record.status,
      freshness,
      record: clone(record),
    };
  }

  async history(reference: StatusReference): Promise<readonly StatusRecord[]> {
    return await this.repository.history(reference);
  }
}

function isAllowed(previous: StatusState | undefined, next: StatusState): boolean {
  if (previous === undefined) return next === "ACTIVE";
  return previous === "ACTIVE" && ["REVOKED", "CANCELLED", "SUPERSEDED", "EXPIRED"].includes(next);
}

function clone(record: StatusRecord): StatusRecord {
  return { ...record };
}
