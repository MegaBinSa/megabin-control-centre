import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { FakeIntegrationAdapter } from "@megabin/integrations";
import type { ActorReference } from "@megabin/domain-types";
import {
  createRuntimeHandler,
  MemoryJobStateStore,
  SupabaseRuntimeDatabase,
  type RuntimeRpcClient
} from "@megabin/runtime";

function environment(): "local" | "staging" | "production" {
  const value = Deno.env.get("MEGABIN_ENVIRONMENT") ?? "local";
  if (value !== "local" && value !== "staging" && value !== "production") {
    throw new Error("MEGABIN_ENVIRONMENT is invalid.");
  }
  return value;
}

function jwtSubject(request: Request): string | null {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized)) as { readonly sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    const runtimeEnvironment = environment();
    const rpc = (
      context.supabaseAdmin as unknown as {
        schema(name: string): RuntimeRpcClient;
      }
    ).schema("api");
    const database = new SupabaseRuntimeDatabase(rpc);
    const adapter = new FakeIntegrationAdapter(
      {
        integrationId: "runtime-proof-fake",
        provider: "fake",
        capability: "platform-proof",
        environment: runtimeEnvironment,
        mode: runtimeEnvironment === "local" ? "capture" : "test"
      },
      { accepted: true }
    );
    const actorId = jwtSubject(request);
    const handler = createRuntimeHandler({
      environment: runtimeEnvironment,
      runtime: {
        environment: runtimeEnvironment,
        service: "platform-runtime",
        buildId: Deno.env.get("DENO_DEPLOYMENT_ID") ?? "local"
      },
      database,
      authenticator: {
        async authenticate(): Promise<ActorReference | null> {
          return actorId ? { kind: "user", id: actorId } : null;
        }
      },
      authorizer: {
        async isAllowed(actor): Promise<boolean> {
          const { data, error } = await rpc.rpc("is_platform_proof_authorized", {
            p_actor_id: actor.id
          });
          return error === null && data === true;
        }
      },
      adapter,
      jobs: new MemoryJobStateStore(),
      logs: { write: (record) => console.log(JSON.stringify(record)) },
      flagContext: () => ({ environment: runtimeEnvironment }),
      now: () => new Date().toISOString(),
      id: () => crypto.randomUUID()
    });
    return handler(request);
  })
};
