import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createWebsiteIntakeHandler, type RuntimeRpcClient } from "@megabin/runtime";

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

function allowedOrigins(environment: string): string[] {
  const configured = (Deno.env.get("MEGABIN_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.includes("*")) throw new Error("Wildcard CORS is forbidden.");
  return environment === "local" ? [...configured, "http://127.0.0.1:4174"] : configured;
}

function withCors(request: Request, response: Response, origins: readonly string[]): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !origins.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set(
    "Access-Control-Allow-Headers",
    "content-type, idempotency-key, x-integration-key, x-integration-secret, x-correlation-id"
  );
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  fetch: withSupabase({ auth: "none" }, async (request, context) => {
    const environment = Deno.env.get("MEGABIN_ENVIRONMENT") ?? "local";
    if (!["local", "staging", "production"].includes(environment))
      throw new Error("MEGABIN_ENVIRONMENT is invalid.");
    const origins = allowedOrigins(environment);
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin");
      return origin && origins.includes(origin)
        ? withCors(request, new Response(null, { status: 204 }), origins)
        : Response.json(
            { ok: false, error: { code: "permission_denied", message: "Origin denied." } },
            { status: 403 }
          );
    }
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
    const response =
      (await handler(request)) ??
      Response.json(
        { ok: false, error: { code: "not_found", message: "Endpoint not found." } },
        { status: 404 }
      );
    return withCors(request, response, origins);
  })
};
