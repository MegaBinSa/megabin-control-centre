export type CommunicationChannel = "whatsapp" | "sms" | "email";
export type MessagingHealth =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "authentication_required"
  | "disabled"
  | "unknown";
export type MessagingFailure =
  | "unavailable"
  | "temporary"
  | "permanent"
  | "rate_limited"
  | "authentication"
  | "invalid_destination"
  | "rejected_template";

export interface OutboundMessage {
  readonly channel: CommunicationChannel;
  readonly destination: string;
  readonly subject?: string;
  readonly body: string;
  readonly templateKey: string;
  readonly templateVersion: number;
}
export type MessagingResult =
  | { readonly ok: true; readonly providerMessageId: string; readonly status: "accepted" }
  | {
      readonly ok: false;
      readonly classification: MessagingFailure;
      readonly safeMessage: string;
      readonly retryAfterMs?: number;
    };
export interface DeliveryCallback {
  readonly providerMessageId: string;
  readonly status: "accepted" | "sent" | "delivered" | "failed" | "read";
  readonly occurredAt: string;
}
export interface NormalizedInboundMessage {
  readonly providerMessageId: string;
  readonly channel: CommunicationChannel;
  readonly sender: string;
  readonly receivedAt: string;
  readonly text: string;
}
export interface MessagingProviderAdapter {
  readonly providerKey: string;
  readonly capabilities: readonly CommunicationChannel[];
  health(channel?: CommunicationChannel): Promise<{
    readonly status: MessagingHealth;
    readonly summary: string;
  }>;
  send(message: OutboundMessage, idempotencyKey: string): Promise<MessagingResult>;
  normalizeDeliveryCallback(payload: unknown): DeliveryCallback;
  normalizeInbound(payload: unknown): NormalizedInboundMessage;
}

export type FakeMessagingScenario =
  | "success"
  | "unavailable"
  | "permanent_failure"
  | "temporary_failure"
  | "rate_limit"
  | "authentication_failure";
export class FakeMessagingAdapter implements MessagingProviderAdapter {
  readonly providerKey = "fake-communications";
  readonly capabilities = ["whatsapp", "sms", "email"] as const;
  readonly sends: OutboundMessage[] = [];
  private readonly results = new Map<string, MessagingResult>();
  constructor(
    private readonly scenarios: Partial<Record<CommunicationChannel, FakeMessagingScenario>> = {}
  ) {}
  async health() {
    const values = Object.values(this.scenarios);
    if (values.includes("authentication_failure"))
      return { status: "authentication_required" as const, summary: "Authentication required." };
    if (values.some((v) => v !== "success"))
      return { status: "degraded" as const, summary: "Synthetic channel degradation." };
    return { status: "healthy" as const, summary: "Deterministic fake messaging provider." };
  }
  async send(message: OutboundMessage, idempotencyKey: string): Promise<MessagingResult> {
    const prior = this.results.get(idempotencyKey);
    if (prior) return prior;
    this.sends.push(message);
    const scenario = this.scenarios[message.channel] ?? "success";
    const failure = (classification: MessagingFailure, retryAfterMs?: number): MessagingResult => ({
      ok: false,
      classification,
      safeMessage: "Synthetic messaging provider failure.",
      ...(retryAfterMs === undefined ? {} : { retryAfterMs })
    });
    const result: MessagingResult =
      scenario === "success"
        ? {
            ok: true,
            providerMessageId: `fake-${message.channel}-${this.sends.length}`,
            status: "accepted"
          }
        : scenario === "rate_limit"
          ? failure("rate_limited", 1000)
          : scenario === "authentication_failure"
            ? failure("authentication")
            : scenario === "temporary_failure"
              ? failure("temporary")
              : scenario === "unavailable"
                ? failure("unavailable")
                : failure("permanent");
    if (result.ok || !["temporary", "rate_limited"].includes(result.classification))
      this.results.set(idempotencyKey, result);
    return result;
  }
  normalizeDeliveryCallback(payload: unknown): DeliveryCallback {
    const value = payload as DeliveryCallback;
    if (
      !value.providerMessageId ||
      !["accepted", "sent", "delivered", "failed", "read"].includes(value.status)
    )
      throw new TypeError("Invalid delivery callback.");
    return value;
  }
  normalizeInbound(payload: unknown): NormalizedInboundMessage {
    const value = payload as NormalizedInboundMessage;
    if (!value.providerMessageId || !value.sender || typeof value.text !== "string")
      throw new TypeError("Invalid inbound message.");
    return value;
  }
}

export const parseInboundCommand = (text: string): "skip" | "unknown" =>
  text.trim().toLocaleLowerCase() === "skip" ? "skip" : "unknown";
