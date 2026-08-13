import { describe, expect, it } from "vitest";
import type { ActorReference } from "@megabin/domain-types";
import { FakeIntegrationAdapter } from "@megabin/integrations";
import type { StructuredLogRecord } from "@megabin/observability";

import {
  BackgroundJobRunner,
  createCancellationSignal,
  createRuntimeHandler,
  loadRuntimeConfiguration,
  MemoryJobStateStore,
  MemoryRuntimeDatabase,
  OutboxDispatcher,
  type RuntimeDependencies
} from "./index.js";

const actor: ActorReference = {
  kind: "user",
  id: "00000000-0000-0000-0000-000000000001"
};

function proofRequest(
  value: string,
  key: string,
  correlationId = "10000000-0000-0000-0000-000000000001",
  forceRollback = false
): Request {
  return new Request("http://localhost/api/v1/platform-proof", {
    method: "POST",
    headers: {
      Authorization: "Bearer synthetic",
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      "X-Correlation-Id": correlationId
    },
    body: JSON.stringify({ value, forceRollback })
  });
}

function harness(options?: {
  readonly authenticated?: boolean;
  readonly authorized?: boolean;
  readonly database?: MemoryRuntimeDatabase;
  readonly adapter?: FakeIntegrationAdapter<
    import("./contracts.js").ClaimedOutboxEvent,
    { readonly accepted: boolean }
  >;
  readonly flagContext?: RuntimeDependencies["flagContext"];
}): {
  readonly database: MemoryRuntimeDatabase;
  readonly logs: StructuredLogRecord[];
  readonly dependencies: RuntimeDependencies;
  readonly handle: (request: Request) => Promise<Response>;
} {
  const database = options?.database ?? new MemoryRuntimeDatabase();
  const logs: StructuredLogRecord[] = [];
  let id = 0;
  const dependencies: RuntimeDependencies = {
    environment: "local",
    runtime: { environment: "local", service: "runtime-test", buildId: "test-build" },
    database,
    authenticator: {
      async authenticate() {
        return options?.authenticated === false ? null : actor;
      }
    },
    authorizer: {
      async isAllowed() {
        return options?.authorized !== false;
      }
    },
    adapter:
      options?.adapter ??
      new FakeIntegrationAdapter(
        {
          integrationId: "fake-runtime",
          provider: "fake",
          capability: "platform-proof",
          environment: "local",
          mode: "capture"
        },
        { accepted: true }
      ),
    jobs: new MemoryJobStateStore(),
    logs: { write: (record) => logs.push(record) },
    flagContext: options?.flagContext ?? (() => ({ environment: "local" })),
    now: () => "2026-08-11T00:00:00.000Z",
    id: () => `00000000-0000-0000-0000-${String(++id).padStart(12, "0")}`
  };
  return { database, logs, dependencies, handle: createRuntimeHandler(dependencies) };
}

describe("synthetic API and transaction runtime", () => {
  it("rejects invalid input and authorization denial through stable envelopes", async () => {
    const denied = harness({ authorized: false });
    const deniedResponse = await denied.handle(proofRequest("valid", "denied"));
    expect(deniedResponse.status).toBe(403);
    expect(await deniedResponse.json()).toMatchObject({
      ok: false,
      error: { code: "permission_denied" }
    });

    const invalid = harness();
    const invalidResponse = await invalid.handle(proofRequest("", "invalid"));
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toMatchObject({
      error: { code: "validation_failed" }
    });
  });

  it("requires the authentication hook", async () => {
    const runtime = harness({ authenticated: false });
    const response = await runtime.handle(proofRequest("valid", "unauthenticated"));
    expect(response.status).toBe(401);
  });

  it("serves OpenAPI from the implemented versioned contract", async () => {
    const runtime = harness();
    const response = await runtime.handle(new Request("http://localhost/api/v1/openapi.json"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      openapi: "3.1.0",
      paths: { "/api/v1/platform-proof": { post: { operationId: "executePlatformProof" } } }
    });
  });

  it("exposes safe environment and build identity in health", async () => {
    const runtime = harness();
    const response = await runtime.handle(new Request("http://localhost/api/v1/health/live"));
    expect(await response.json()).toEqual({
      status: "healthy",
      runtime: { environment: "local", service: "runtime-test", buildId: "test-build" }
    });
  });

  it("commits one state, audit, idempotency result, and outbox event atomically", async () => {
    const runtime = harness();
    const response = await runtime.handle(proofRequest("proof", "first"));
    expect(response.status).toBe(201);
    expect(runtime.database.proofs.size).toBe(1);
    expect(runtime.database.audits).toHaveLength(1);
    expect(runtime.database.events).toHaveLength(1);
  });

  it("returns the prior result for exact and concurrent duplicates", async () => {
    const runtime = harness();
    const [first, second] = await Promise.all([
      runtime.handle(proofRequest("proof", "concurrent")),
      runtime.handle(proofRequest("proof", "concurrent"))
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(runtime.database.proofs.size).toBe(1);
    expect(runtime.database.events).toHaveLength(1);
  });

  it("rejects idempotency key reuse with a different fingerprint", async () => {
    const runtime = harness();
    await runtime.handle(proofRequest("first", "reused"));
    const response = await runtime.handle(proofRequest("different", "reused"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "idempotency_key_reused" } });
    expect(runtime.database.proofs.size).toBe(1);
  });

  it("rolls back state, audit, outbox, and idempotency on forced failure", async () => {
    const runtime = harness();
    const failed = await runtime.handle(proofRequest("proof", "rollback", undefined, true));
    expect(failed.status).toBe(500);
    expect(runtime.database.proofs.size).toBe(0);
    expect(runtime.database.audits).toHaveLength(0);
    expect(runtime.database.events).toHaveLength(0);

    const retried = await runtime.handle(proofRequest("proof", "rollback"));
    expect(retried.status).toBe(201);
  });
});

describe("dispatcher, dead-letter, and replay", () => {
  it("publishes through the fake adapter with one correlation ID", async () => {
    const runtime = harness();
    const correlationId = "20000000-0000-0000-0000-000000000001";
    await runtime.handle(proofRequest("dispatch", "dispatch", correlationId));
    const dispatcher = new OutboxDispatcher(
      runtime.database,
      runtime.dependencies.adapter,
      runtime.dependencies.logs,
      runtime.dependencies.runtime,
      runtime.dependencies.now
    );
    await expect(
      dispatcher.run({ workerId: "worker-1", batchSize: 10, maxAttempts: 3 })
    ).resolves.toMatchObject({ published: 1 });
    expect(runtime.logs.map((record) => record.trace.correlationId)).toEqual([
      correlationId,
      correlationId,
      correlationId
    ]);
  });

  it("retries, dead-letters, continues unrelated work, and replays safely", async () => {
    const adapter = new FakeIntegrationAdapter<
      import("./contracts.js").ClaimedOutboxEvent,
      { readonly accepted: boolean }
    >(
      {
        integrationId: "failing-fake",
        provider: "fake",
        capability: "platform-proof",
        environment: "local",
        mode: "test"
      },
      { accepted: true },
      ["retryable", "retryable"]
    );
    const runtime = harness({ adapter });
    await runtime.handle(proofRequest("fails", "fails"));
    await runtime.handle(proofRequest("continues", "continues"));
    const dispatcher = new OutboxDispatcher(
      runtime.database,
      adapter,
      runtime.dependencies.logs,
      runtime.dependencies.runtime,
      runtime.dependencies.now
    );

    const first = await dispatcher.run({ workerId: "worker-1", batchSize: 10, maxAttempts: 2 });
    expect(first).toMatchObject({ retried: 2 });
    const second = await dispatcher.run({ workerId: "worker-1", batchSize: 10, maxAttempts: 2 });
    expect(second).toMatchObject({ published: 2 });

    const deadAdapter = new FakeIntegrationAdapter<
      import("./contracts.js").ClaimedOutboxEvent,
      { readonly accepted: boolean }
    >(
      {
        integrationId: "dead-fake",
        provider: "fake",
        capability: "platform-proof",
        environment: "local",
        mode: "test"
      },
      { accepted: true },
      ["permanent", "permanent"]
    );
    const deadRuntime = harness({ adapter: deadAdapter });
    await deadRuntime.handle(proofRequest("dead", "dead"));
    const deadDispatcher = new OutboxDispatcher(
      deadRuntime.database,
      deadAdapter,
      deadRuntime.dependencies.logs,
      deadRuntime.dependencies.runtime,
      deadRuntime.dependencies.now
    );
    await deadDispatcher.run({ workerId: "worker-2", batchSize: 1, maxAttempts: 2 });
    const deadResult = await deadDispatcher.run({
      workerId: "worker-2",
      batchSize: 1,
      maxAttempts: 2
    });
    expect(deadResult.deadLettered).toBe(1);
    const deadLetters = await deadRuntime.database.getDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect((await deadRuntime.database.outboxHealth()).status).toBe("degraded");
    const deadLetter = deadLetters[0];
    if (!deadLetter) throw new Error("Expected one synthetic dead-letter event.");

    await expect(deadRuntime.database.replayDeadLetter(deadLetter.eventId)).resolves.toBe(true);
    await expect(
      deadDispatcher.run({ workerId: "worker-2", batchSize: 1, maxAttempts: 2 })
    ).resolves.toMatchObject({ published: 1 });
    expect(deadAdapter.interactions).toHaveLength(3);
  });
});

describe("configuration, health, and jobs", () => {
  it("loads overrides and fails safely for invalid or missing required configuration", async () => {
    const overrides = new MemoryRuntimeDatabase({
      "runtime.proof-enabled": true,
      "runtime.dispatcher-batch-size": 5
    });
    await expect(loadRuntimeConfiguration(overrides, "local")).resolves.toEqual({
      proofEnabled: true,
      dispatcherBatchSize: 5,
      dispatcherMaxAttempts: 3
    });
    await expect(
      loadRuntimeConfiguration(
        new MemoryRuntimeDatabase({ "runtime.proof-enabled": "yes" }),
        "local"
      )
    ).rejects.toThrow("must be a boolean");
    await expect(loadRuntimeConfiguration(new MemoryRuntimeDatabase({}), "local")).rejects.toThrow(
      "has no value"
    );
  });

  it("applies safe-default and targeted feature flags after authorization", async () => {
    const disabledByDefault = harness({
      database: new MemoryRuntimeDatabase(
        { "runtime.proof-enabled": true },
        { key: "runtime.platform-proof", defaultEnabled: false, targets: [] }
      )
    });
    expect((await disabledByDefault.handle(proofRequest("flag", "flag-default"))).status).toBe(404);

    const targetedDatabase = new MemoryRuntimeDatabase(
      { "runtime.proof-enabled": true },
      {
        key: "runtime.platform-proof",
        defaultEnabled: false,
        targets: [
          { environment: "local", enabled: true },
          {
            environment: "local",
            enabled: true,
            serviceRegionId: "region-1",
            teamId: "team-1"
          },
          {
            environment: "local",
            enabled: false,
            serviceRegionId: "region-1",
            teamId: "team-1"
          }
        ]
      }
    );
    const targeted = harness({
      database: targetedDatabase,
      flagContext: () => ({
        environment: "local",
        roleId: "role-1",
        serviceRegionId: "region-1",
        teamId: "team-1"
      })
    });
    expect((await targeted.handle(proofRequest("flag", "flag-target"))).status).toBe(404);
  });

  it("reports safe liveness, readiness, and platform health", async () => {
    const runtime = harness();
    for (const path of ["health/live", "health/ready", "health"]) {
      const response = await runtime.handle(new Request(`http://localhost/api/v1/${path}`));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "healthy" });
    }
  });

  it("runs a bounded idempotent job, checks cancellation, and records failure", async () => {
    const state = new MemoryJobStateStore();
    const runner = new BackgroundJobRunner(state);
    let effects = 0;
    const input = {
      jobId: "job-1",
      jobType: "synthetic-proof",
      idempotencyKey: "job-key",
      concurrencyKey: "synthetic-singleton",
      correlationId: "correlation-job",
      attempt: 1,
      cancellation: createCancellationSignal(),
      execute: async () => ++effects
    };
    await expect(runner.run(input)).resolves.toEqual({ duplicate: false, result: 1 });
    await expect(runner.run({ ...input, jobId: "job-2" })).resolves.toEqual({
      duplicate: true,
      result: 1
    });
    expect(effects).toBe(1);
    await expect(
      runner.run({
        ...input,
        jobId: "job-3",
        idempotencyKey: "cancelled",
        cancellation: createCancellationSignal(true)
      })
    ).rejects.toThrow("cancellation");
    await expect(
      runner.run({
        ...input,
        jobId: "job-4",
        idempotencyKey: "failure",
        execute: async () => {
          throw new Error("Synthetic job failure.");
        }
      })
    ).rejects.toThrow("Synthetic job failure");
    expect(state.failures).toHaveLength(1);
    expect((await state.health()).status).toBe("healthy");
  });
});
