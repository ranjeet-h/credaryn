import { redactFields } from "@credaryn/observability";

export interface AuditEvent {
  actor: string;
  action: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export function createAuditEvent(input: { actor: string; action: string; metadata?: Record<string, unknown>; now?: () => string }): AuditEvent {
  return {
    actor: input.actor,
    action: input.action,
    occurredAt: (input.now ?? (() => new Date().toISOString()))(),
    metadata: redactFields(input.metadata ?? {}),
  };
}
