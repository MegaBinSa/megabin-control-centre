export const API_VERSION = "v1" as const;
export const API_BASE_PATH = `/api/${API_VERSION}` as const;

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key" as const;
export const CORRELATION_ID_HEADER = "X-Correlation-Id" as const;

export type ApiErrorCode =
  | "authentication_required"
  | "permission_denied"
  | "validation_failed"
  | "conflict"
  | "idempotency_key_reused"
  | "not_found"
  | "rate_limited"
  | "internal_error";

export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly correlationId: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiError };

export interface IdempotentRequestIdentity {
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export function buildIdempotentRequestHeaders(
  identity: IdempotentRequestIdentity
): Readonly<Record<string, string>> {
  if (identity.idempotencyKey.trim().length === 0) {
    throw new TypeError("An idempotency key is required.");
  }

  if (identity.correlationId.trim().length === 0) {
    throw new TypeError("A correlation ID is required.");
  }

  return {
    [IDEMPOTENCY_KEY_HEADER]: identity.idempotencyKey,
    [CORRELATION_ID_HEADER]: identity.correlationId
  };
}
