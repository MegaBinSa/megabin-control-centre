import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  FakeIntegrationAdapter,
  FakeMessagingAdapter,
  FakeZohoBooksAdapter
} from "@megabin/integrations";
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
  createWebsiteIntakeHandler,
  createClientMigrationHandler,
  createAccountingHandler,
  createFinancialEligibilityHandler,
  createCommunicationsHandler,
  createClientSkipHandler,
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
    const websiteIntake = createWebsiteIntakeHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID(),
      integrationKey:
        Deno.env.get("MEGABIN_WEBSITE_ONBOARDING_INTEGRATION_KEY") ??
        "megabin-website-onboarding-local",
      integrationSecret: Deno.env.get("MEGABIN_WEBSITE_ONBOARDING_SECRET"),
      allowIntegrationRoutes: false,
      defer: (work) => EdgeRuntime.waitUntil(work)
    });
    const websiteIntakeResponse = await websiteIntake(request);
    if (websiteIntakeResponse) return websiteIntakeResponse;
    const clientMigrationResponse = await createClientMigrationHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID(),
      environment: (Deno.env.get("MEGABIN_ENVIRONMENT") ?? "local") as
        | "local"
        | "staging"
        | "production"
    })(request);
    if (clientMigrationResponse) return clientMigrationResponse;
    const accountingResponse = await createAccountingHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID(),
      environment: runtimeEnvironment,
      provider: new FakeZohoBooksAdapter(),
      organizationId: Deno.env.get("MEGABIN_ACCOUNTING_ORGANIZATION_ID") ?? "local-synthetic",
      pageSize: Number(Deno.env.get("MEGABIN_ACCOUNTING_PAGE_SIZE") ?? 100),
      maxRetryAfterMs: Number(Deno.env.get("MEGABIN_ACCOUNTING_MAX_RETRY_DELAY_MS") ?? 5000),
      defer: (work) => EdgeRuntime.waitUntil(work)
    })(request);
    if (accountingResponse) return accountingResponse;
    const financialEligibilityResponse = await createFinancialEligibilityHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID(),
      defer: (work) => EdgeRuntime.waitUntil(work)
    })(request);
    if (financialEligibilityResponse) return financialEligibilityResponse;
    const communicationsResponse = await createCommunicationsHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID(),
      environment: runtimeEnvironment,
      mode: (Deno.env.get("MEGABIN_COMMUNICATIONS_MODE") ?? "capture") as
        | "capture"
        | "test"
        | "live",
      provider: new FakeMessagingAdapter(),
      testRecipientAllowlist: (Deno.env.get("MEGABIN_COMMUNICATIONS_TEST_RECIPIENTS") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      webhookSecret: Deno.env.get("MEGABIN_COMMUNICATIONS_WEBHOOK_SECRET"),
      maxRetries: Number(Deno.env.get("MEGABIN_COMMUNICATIONS_MAX_RETRIES") ?? 2),
      defer: (work) => EdgeRuntime.waitUntil(work)
    })(request);
    if (communicationsResponse) return communicationsResponse;
    const clientSkipResponse = await createClientSkipHandler({
      rpc,
      actorId,
      id: () => crypto.randomUUID()
    })(request);
    if (clientSkipResponse) return clientSkipResponse;
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
