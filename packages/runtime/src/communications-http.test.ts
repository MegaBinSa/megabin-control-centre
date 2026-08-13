import { describe, expect, it, vi } from "vitest";
import { FakeMessagingAdapter } from "@megabin/integrations";
import { createCommunicationsHandler, renderCommunicationTemplate } from "./communications-http.js";

const setup = (
  options: {
    actor?: string | null;
    provider?: FakeMessagingAdapter;
    environment?: "local" | "production";
    mode?: "capture" | "test";
  } = {}
) => {
  const deferred: Promise<unknown>[] = [];
  const rpc = {
    rpc: vi.fn(async (name: string) => ({
      data:
        name === "communication_create_intent"
          ? {
              communication_intent_id: "80000000-0000-4000-8000-000000000001",
              template_key: "test_message",
              template_version: 1,
              variables: { clientName: "Synthetic Client" },
              eligibility: {
                contactId: "80000000-0000-4000-8000-000000000002",
                eligibleChannels: ["whatsapp", "sms", "email"],
                mobile: "+27820000001",
                email: "client@example.invalid",
                language: "english"
              }
            }
          : { items: [] },
      error: null
    }))
  };
  return {
    rpc,
    deferred,
    handler: createCommunicationsHandler({
      rpc,
      actorId: options.actor === undefined ? "80000000-0000-4000-8000-000000000003" : options.actor,
      id: () => "80000000-0000-4000-8000-000000000004",
      environment: options.environment ?? "local",
      mode: options.mode ?? "test",
      provider: options.provider ?? new FakeMessagingAdapter(),
      testRecipientAllowlist: ["+27820000001", "client@example.invalid"],
      webhookSecret: "synthetic-secret",
      defer: (work) => deferred.push(work)
    })
  };
};
const request = () =>
  new Request("http://x/api/v1/communications/test-send", {
    method: "POST",
    headers: { "Idempotency-Key": "source-1" },
    body: JSON.stringify({
      communicationType: "test_message",
      clientId: "57000000-0000-4000-8000-000000000001",
      sourceDomain: "manual",
      sourceReference: "office-test-1",
      templateKey: "test_message",
      templateVersion: 1,
      priority: "normal",
      variables: { clientName: "Synthetic Client" }
    })
  });
describe("communications HTTP boundary", () => {
  it("renders only contracted variables and rejects missing or arbitrary values", () => {
    expect(
      renderCommunicationTemplate("test_message", "email", { clientName: "Synthetic" })
    ).toMatchObject({ subject: "MegaBin test message" });
    expect(() => renderCommunicationTemplate("test_message", "sms", {})).toThrow("Missing");
    expect(() =>
      renderCommunicationTemplate("test_message", "sms", { clientName: "Synthetic", secret: "no" })
    ).toThrow("Unsupported");
  });
  it("queues WhatsApp first and stops after accepted delivery", async () => {
    const provider = new FakeMessagingAdapter(),
      d = setup({ provider });
    expect((await d.handler(request()))?.status).toBe(202);
    await Promise.all(d.deferred);
    expect(provider.sends.map((send) => send.channel)).toEqual(["whatsapp"]);
  });
  it("falls back WhatsApp to SMS and then email only for permanent failures", async () => {
    const provider = new FakeMessagingAdapter({
        whatsapp: "permanent_failure",
        sms: "permanent_failure"
      }),
      d = setup({ provider });
    await d.handler(request());
    await Promise.all(d.deferred);
    expect(provider.sends.map((send) => send.channel)).toEqual(["whatsapp", "sms", "email"]);
    expect(d.rpc.rpc).not.toHaveBeenCalledWith("communication_fail_intent", expect.anything());
  });
  it("marks the intent failed only after every fallback channel is exhausted", async () => {
    const provider = new FakeMessagingAdapter({
        whatsapp: "permanent_failure",
        sms: "permanent_failure",
        email: "permanent_failure"
      }),
      d = setup({ provider });
    await d.handler(request());
    await Promise.all(d.deferred);
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "communication_fail_intent",
      expect.objectContaining({ p_classification: "fallback_exhausted" })
    );
  });
  it("does not fall back while a rate-limited attempt is retryable", async () => {
    const provider = new FakeMessagingAdapter({ whatsapp: "rate_limit" }),
      d = setup({ provider });
    await d.handler(request());
    await Promise.all(d.deferred);
    expect(provider.sends).toHaveLength(3);
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "communication_record_attempt",
      expect.objectContaining({ p_failure: "rate_limited", p_retry: 2 })
    );
  });
  it("enforces non-production recipient protection", async () => {
    const d = setup();
    // remove the allowlist by rebuilding the handler directly
    d.handler = createCommunicationsHandler({
      rpc: d.rpc,
      actorId: "80000000-0000-4000-8000-000000000003",
      id: () => crypto.randomUUID(),
      environment: "local",
      mode: "test",
      provider: new FakeMessagingAdapter(),
      testRecipientAllowlist: [],
      webhookSecret: "synthetic-secret",
      defer: (work) => d.deferred.push(work)
    });
    await d.handler(request());
    await Promise.all(d.deferred);
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "communication_record_attempt",
      expect.objectContaining({ p_failure: "invalid_destination" })
    );
  });
  it("rejects live provider mode outside production", () => {
    const d = setup();
    expect(() =>
      createCommunicationsHandler({
        rpc: d.rpc,
        actorId: "80000000-0000-4000-8000-000000000003",
        id: () => crypto.randomUUID(),
        environment: "local",
        mode: "live",
        provider: new FakeMessagingAdapter(),
        testRecipientAllowlist: [],
        defer: () => undefined
      })
    ).toThrow("only in production");
  });
  it("authenticates provider callbacks and inbound messages", async () => {
    const d = setup();
    const denied = await d.handler(
      new Request("http://x/api/v1/integrations/communications/inbound", {
        method: "POST",
        body: "{}"
      })
    );
    expect(denied?.status).toBe(401);
    const accepted = await d.handler(
      new Request("http://x/api/v1/integrations/communications/inbound", {
        method: "POST",
        headers: { "X-Communications-Webhook-Secret": "synthetic-secret" },
        body: JSON.stringify({
          providerMessageId: "inbound-1",
          channel: "whatsapp",
          sender: "+27820000001",
          receivedAt: "2026-08-13T00:00:00Z",
          text: " SKIP "
        })
      })
    );
    expect(accepted?.status).toBe(200);
    expect(d.rpc.rpc).toHaveBeenCalledWith(
      "communication_ingest_inbound",
      expect.objectContaining({ p_content: " SKIP " })
    );
  });
  it("denies unauthenticated Office access", async () => {
    expect(
      (await setup({ actor: null }).handler(new Request("http://x/api/v1/communications/intents")))
        ?.status
    ).toBe(401);
  });
});
