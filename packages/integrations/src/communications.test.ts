import { describe, expect, it } from "vitest";
import { FakeMessagingAdapter, parseInboundCommand } from "./communications.js";

const message = (channel: "whatsapp" | "sms" | "email") => ({
  channel,
  destination: channel === "email" ? "client@example.invalid" : "+27820000001",
  body: "Synthetic service message.",
  templateKey: "test_message",
  templateVersion: 1
});
describe("messaging adapter", () => {
  it("is deterministic and supports channel failures, rate limits, and health", async () => {
    const adapter = new FakeMessagingAdapter({ whatsapp: "rate_limit", sms: "permanent_failure" });
    expect(await adapter.send(message("whatsapp"), "one")).toMatchObject({
      ok: false,
      classification: "rate_limited",
      retryAfterMs: 1000
    });
    expect(await adapter.send(message("sms"), "two")).toMatchObject({
      ok: false,
      classification: "permanent"
    });
    expect((await adapter.health()).status).toBe("degraded");
  });
  it("normalizes callbacks, inbound messages, and SKIP without business action", () => {
    const adapter = new FakeMessagingAdapter();
    expect(
      adapter.normalizeDeliveryCallback({
        providerMessageId: "fake-1",
        status: "delivered",
        occurredAt: "2026-08-13T00:00:00Z"
      }).status
    ).toBe("delivered");
    expect(parseInboundCommand("  SKIP ")).toBe("skip");
    expect(parseInboundCommand("hello")).toBe("unknown");
  });
});
