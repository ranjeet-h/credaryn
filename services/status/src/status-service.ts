import type { LifecycleStatus } from "@credaryn/core";

export type StatusState = Exclude<LifecycleStatus, "UNCHECKED">;
export type StatusFreshness = "FRESH" | "STALE" | "UNAVAILABLE";

export interface StatusRecord {
  issuerId: string;
  keyId: string;
  status: StatusState;
  updatedAt: string;
  reason: string;
}

export interface StatusLookup {
  issuerId: string;
  keyId: string;
  lifecycleStatus: LifecycleStatus;
  freshness: StatusFreshness;
  record?: StatusRecord;
}

export interface StatusTransition {
  issuerId: string;
  keyId: string;
  status: StatusState;
  reason: string;
}

export class StatusServiceUnavailableError extends Error {
  constructor() {
    super("Status service is unavailable");
    this.name = "StatusServiceUnavailableError";
  }
}

export class StatusService {
  private readonly records = new Map<string, StatusRecord>();
  private readonly histories = new Map<string, StatusRecord[]>();
  private readonly now: () => string;
  private readonly maxAgeMs: number;
  private available = true;

  constructor(options: { now?: () => string; maxAgeMs?: number } = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1000;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  transition(input: StatusTransition): StatusRecord {
    if (!this.available) throw new StatusServiceUnavailableError();
    if (input.reason.trim() === "") throw new Error("Status transitions require a reason");
    const key = reference(input.issuerId, input.keyId);
    const previous = this.records.get(key);
    if (!isAllowed(previous?.status, input.status)) {
      throw new Error(`Invalid status transition from ${previous?.status ?? "NONE"} to ${input.status}`);
    }
    const record: StatusRecord = { ...input, updatedAt: this.now() };
    this.records.set(key, record);
    const history = this.histories.get(key) ?? [];
    history.push(clone(record));
    this.histories.set(key, history);
    return clone(record);
  }

  get(issuerId: string, keyId: string, options: { requireFreshness?: boolean } = {}): StatusLookup {
    if (!this.available) return { issuerId, keyId, lifecycleStatus: "UNCHECKED", freshness: "UNAVAILABLE" };
    const record = this.records.get(reference(issuerId, keyId));
    if (record === undefined) return { issuerId, keyId, lifecycleStatus: "UNCHECKED", freshness: "FRESH" };
    const age = Date.parse(this.now()) - Date.parse(record.updatedAt);
    const freshness: StatusFreshness = Number.isFinite(age) && age > this.maxAgeMs ? "STALE" : "FRESH";
    return {
      issuerId,
      keyId,
      lifecycleStatus: options.requireFreshness && freshness !== "FRESH" ? "UNCHECKED" : record.status,
      freshness,
      record: clone(record),
    };
  }

  history(issuerId: string, keyId: string): readonly StatusRecord[] {
    return (this.histories.get(reference(issuerId, keyId)) ?? []).map(clone);
  }
}

function isAllowed(previous: StatusState | undefined, next: StatusState): boolean {
  if (previous === undefined) return next === "ACTIVE";
  return previous === "ACTIVE" && ["REVOKED", "CANCELLED", "SUPERSEDED", "EXPIRED"].includes(next);
}

function reference(issuerId: string, keyId: string): string {
  return `${issuerId}\u0000${keyId}`;
}

function clone(record: StatusRecord): StatusRecord {
  return { ...record };
}
