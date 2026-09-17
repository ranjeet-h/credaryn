export interface TraceContext {
  correlationId: string;
  traceId: string;
  sampled: boolean;
}

export function createTraceContext(correlationId: string, traceId = correlationId): TraceContext {
  return { correlationId, traceId, sampled: false };
}
