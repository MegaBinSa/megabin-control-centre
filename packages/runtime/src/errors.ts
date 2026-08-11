export class RuntimeError extends Error {
  constructor(
    readonly code:
      | "authentication_required"
      | "permission_denied"
      | "validation_failed"
      | "conflict"
      | "idempotency_key_reused"
      | "not_found"
      | "internal_error",
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "RuntimeError";
  }
}

export class ForcedRollbackError extends Error {
  constructor() {
    super("Synthetic rollback requested.");
    this.name = "ForcedRollbackError";
  }
}
