import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { FakeIntegrationAdapter } from "@megabin/integrations";
import { FakeOptimizationProvider, FakeRoutingProvider } from "@megabin/route-planning";
import type { ActorReference } from "@megabin/domain-types";
import {
  createRuntimeHandler,
  createMasterDataHandler,
  createGeographyHandler,
  createRosterHandler,
  createRouteHandler,
  createRouteOperationsHandler,
  createVehicleTrackingHandler,
  createLiveOperationsHandler,
  MemoryJobStateStore,
  SupabaseRuntimeDatabase,
  type RuntimeRpcClient
} from "@megabin/runtime";

declare const EdgeRuntime: {
  waitUntil(work: Promise<unknown>): void;
};

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
    const liveOperations = createLiveOperationsHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID(),
      defer: (work) => EdgeRuntime.waitUntil(work)
    });
    const liveOperationsResponse = await liveOperations(request);
    if (liveOperationsResponse) return liveOperationsResponse;
    const vehicleTracking = createVehicleTrackingHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID()
    });
    const trackingResponse = await vehicleTracking(request);
    if (trackingResponse) return trackingResponse;
    const providerConfigurationResult = await rpc.rpc("route_provider_configuration", {
      p_environment_name: runtimeEnvironment
    });
    const providerConfiguration =
      providerConfigurationResult.error === null &&
      providerConfigurationResult.data &&
      typeof providerConfigurationResult.data === "object"
        ? (providerConfigurationResult.data as Record<string, unknown>)
        : {};
    const routing =
      providerConfiguration["routes.routing-provider"] === "fake-routing"
        ? new FakeRoutingProvider()
        : undefined;
    const optimizer =
      routing && providerConfiguration["routes.optimization-provider"] === "fake-optimizer"
        ? new FakeOptimizationProvider(routing)
        : undefined;
    const routes = createRouteHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID(),
      routing,
      optimizer,
      providerRuntime: {
        timeoutMs: Number(providerConfiguration["routes.provider-timeout-ms"] ?? 15000),
        maxRetries: Number(providerConfiguration["routes.provider-max-retries"] ?? 2),
        maxRetryAfterMs: Number(
          providerConfiguration["routes.provider-max-retry-delay-ms"] ?? 5000
        ),
        maxStops: Number(providerConfiguration["routes.provider-max-stops"] ?? 200)
      },
      defer: (work) => EdgeRuntime.waitUntil(work)
    });
    const routeResponse = await routes(request);
    if (routeResponse) return routeResponse;
    const routeOperations = createRouteOperationsHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID()
    });
    const routeOperationsResponse = await routeOperations(request);
    if (routeOperationsResponse) return routeOperationsResponse;
    const roster = createRosterHandler({ rpc, actorId, id: () => crypto.randomUUID() });
    const rosterResponse = await roster(request);
    if (rosterResponse) return rosterResponse;
    const geography = createGeographyHandler({ rpc, actorId, id: () => crypto.randomUUID() });
    const geographyResponse = await geography(request);
    if (geographyResponse) return geographyResponse;
    const masterData = createMasterDataHandler({ rpc, actorId, id: () => crypto.randomUUID() });
    const masterDataResponse = await masterData(request);
    if (masterDataResponse) return masterDataResponse;
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
