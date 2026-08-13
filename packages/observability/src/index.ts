export const ERROR_CATEGORIES = [
  "validation",
  "authentication",
  "authorization",
  "conflict",
  "dependency_transient",
  "dependency_permanent",
  "rate_limit",
  "cancelled",
  "unexpected"
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface TraceContext {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly requestId?: string;
  readonly jobId?: string;
  readonly eventId?: string;
}

export interface RuntimeMetadata {
  readonly environment: "local" | "staging" | "production";
  readonly service: string;
  readonly buildId: string;
  readonly deploymentId?: string;
  readonly buildTimestamp?: string;
}

export interface StructuredLogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly trace: TraceContext;
  readonly runtime: RuntimeMetadata;
  readonly metadata: Readonly<Record<string, unknown>>;
}

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|credential|email|name|password|phone|secret|token|address/i;

export function redactMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactMetadata);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactMetadata(child)
    ])
  );
}

export function createChildTrace(
  parent: TraceContext,
  identifiers: Omit<TraceContext, "correlationId">
): TraceContext {
  return { correlationId: parent.correlationId, ...identifiers };
}

export function createLogRecord(input: {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly trace: TraceContext;
  readonly runtime: RuntimeMetadata;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): StructuredLogRecord {
  return {
    timestamp: input.timestamp,
    level: input.level,
    message: input.message,
    trace: input.trace,
    runtime: input.runtime,
    metadata: (redactMetadata(input.metadata ?? {}) ?? {}) as Readonly<Record<string, unknown>>
  };
}

export interface HealthCheckResult {
  readonly status: "healthy" | "degraded" | "unhealthy" | "disabled" | "unknown";
  readonly checkedAt: string;
  readonly summary: string;
  readonly safeDetails?: Readonly<Record<string, unknown>>;
}
