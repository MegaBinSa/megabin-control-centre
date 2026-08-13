import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createWebsiteIntakeHandler, type RuntimeRpcClient } from "@megabin/runtime";

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

export default {
  fetch: withSupabase({ auth: "none" }, async (request, context) => {
    const environment = Deno.env.get("MEGABIN_ENVIRONMENT") ?? "local";
    const configuredIntegrationKey = Deno.env.get("MEGABIN_WEBSITE_ONBOARDING_INTEGRATION_KEY");
    const rpc = (
      context.supabaseAdmin as unknown as { schema(name: string): RuntimeRpcClient }
    ).schema("api");
    const handler = createWebsiteIntakeHandler({
      rpc,
      actorId: null,
      id: () => crypto.randomUUID(),
      integrationKey:
        configuredIntegrationKey ??
        (environment === "local" ? "megabin-website-onboarding-local" : ""),
      integrationSecret: Deno.env.get("MEGABIN_WEBSITE_ONBOARDING_SECRET"),
      allowIntegrationRoutes: true,
      defer: (work) => EdgeRuntime.waitUntil(work)
    });
    return (
      (await handler(request)) ??
      Response.json(
        { ok: false, error: { code: "not_found", message: "Endpoint not found." } },
        { status: 404 }
      )
    );
  })
};
