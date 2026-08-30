import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readSkipUatConfig,
  submitSkipUatInbound,
  validateSkipUatPlan
} from "../scripts/skip-uat-inbound.mjs";

const sourceSha = "e2277efdfc37b25033e72bd2dac043ac28adfb24";
const projectRef = "xniweqdmswzljcgkfglx";
const providerMessageId = "uat:skip:UAT-SKP-001:20260831:01";
const base = {
  environment: "staging",
  projectRef,
  supabaseUrl: `https://${projectRef}.supabase.co`,
  runtimeUrl: `https://${projectRef}.supabase.co/functions/v1/platform-runtime`,
  publishableKey: "synthetic-publishable-key",
  officeEmail: "staging-office@megabin.local",
  officePassword: "protected-office-password",
  webhookSecret: "protected-webhook-secret",
  sourceSha,
  providerMessageId,
  confirmation: `SUBMIT-UAT-SKP-001:${projectRef}:${providerMessageId}:${sourceSha}`,
  workflowRunId: "123",
  workflowRunAttempt: "1",
  operator: "synthetic-operator"
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

const successfulFetch = () => {
  const requestBodies: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/auth/v1/token")) {
      expect(new Headers(init?.headers).get("apikey")).toBe(base.publishableKey);
      return Response.json({ access_token: "protected-office-token" });
    }
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer protected-office-token");
    expect(headers.get("X-Communications-Webhook-Secret")).toBe(base.webhookSecret);
    const body = String(init?.body);
    requestBodies.push(body);
    return Response.json({
      ok: true,
      data: {
        inboundMessageId: "80000000-0000-4000-8000-000000000001",
        recognizedCommand: "skip",
        duplicate: requestBodies.length > 1,
        clientSkip: {
          clientSkipRequestId: "80000000-0000-4000-8000-000000000002",
          collectionOccurrenceId: "80000000-0000-4000-8000-000000000003",
          clientServiceId: "b0c742aa-9484-4c49-afd5-c164404c8080",
          serviceRegionId: "51000000-0000-0000-0000-000000000001",
          matchState: "matched",
          lifecycleStatus: "qualified",
          cutoffStatus: "before_cutoff"
        }
      }
    });
  });
  return { fetchMock, requestBodies };
};

describe("protected SKIP UAT inbound submission", () => {
  it("accepts only the immutable Shared Staging plan and exact confirmation", async () => {
    const config = await readSkipUatConfig();
    expect(validateSkipUatPlan(config, base)).toMatchObject({ ok: true, errors: [] });
    const unsafe = validateSkipUatPlan(config, {
      ...base,
      projectRef: "production-project-ref",
      supabaseUrl: "https://production-project-ref.supabase.co",
      providerMessageId: "arbitrary-message",
      confirmation: "wrong"
    });
    expect(unsafe.ok).toBe(false);
    expect(unsafe.errors.join(" ")).toContain("Production references are forbidden");
    expect(unsafe.errors.join(" ")).toContain("reserved provider message identity");
    expect(unsafe.errors.join(" ")).toContain("confirmation");
  });

  it("authenticates, posts the fixed payload once and retains only sanitized evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "megabin-skip-uat-"));
    temporaryDirectories.push(directory);
    const evidencePath = join(directory, "evidence.json");
    const { fetchMock, requestBodies } = successfulFetch();
    const evidence = await submitSkipUatInbound(
      { ...base, evidencePath },
      fetchMock as unknown as typeof fetch
    );
    const config = await readSkipUatConfig();
    expect(requestBodies).toEqual([JSON.stringify(config.payload)]);
    expect(evidence).toMatchObject({
      result: "Passed",
      httpStatus: 200,
      duplicate: false,
      expectedCollectionDate: "2026-08-31"
    });
    const serialized = await readFile(evidencePath, "utf8");
    for (const sensitive of [
      base.webhookSecret,
      base.officePassword,
      "protected-office-token",
      config.payload.sender,
      config.payload.text,
      base.officeEmail
    ])
      expect(serialized).not.toContain(sensitive);
  });

  it("replays the byte-identical provider identity safely", async () => {
    const directory = await mkdtemp(join(tmpdir(), "megabin-skip-uat-"));
    temporaryDirectories.push(directory);
    const { fetchMock, requestBodies } = successfulFetch();
    const first = await submitSkipUatInbound(
      { ...base, evidencePath: join(directory, "first.json") },
      fetchMock as unknown as typeof fetch
    );
    const retry = await submitSkipUatInbound(
      { ...base, evidencePath: join(directory, "retry.json") },
      fetchMock as unknown as typeof fetch
    );
    expect(first.duplicate).toBe(false);
    expect(retry).toMatchObject({
      duplicate: true,
      inboundMessageId: first.inboundMessageId,
      skipRequestId: first.skipRequestId
    });
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1]).toBe(requestBodies[0]);
  });

  it("keeps the workflow manual, protected, main-bound and mutation-bounded", () => {
    const workflow = readFileSync(".github/workflows/submit-staging-skip-uat.yml", "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/\b(push|schedule):/);
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("group: megabin-shared-staging");
    expect(workflow).toContain('test "$(git rev-parse origin/main)" = "$SOURCE_SHA"');
    expect(workflow).toContain("${{ secrets.COMMUNICATIONS_WEBHOOK_SECRET }}");
    expect(workflow).toContain("scripts/skip-uat-inbound.mjs");
    expect(workflow.match(/scripts\/skip-uat-inbound\.mjs/g)).toHaveLength(1);
    expect(workflow).toContain("if-no-files-found: warn");
    expect(
      workflow.match(/\$\{\{ runner\.temp \}\}\/uat-skp-001-inbound-evidence\.json/g)
    ).toHaveLength(2);
    expect(workflow).not.toMatch(/supabase (db|migration|functions|link)/);
    expect(workflow).not.toMatch(/\b(truncate|delete from|drop schema|reset|seed)\b/i);
    expect(workflow).not.toMatch(/echo.*(WEBHOOK_SECRET|OFFICE_PASSWORD)/i);
  });

  it("validates both protected UAT workflows with expression-aware actionlint", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain(".github/workflows/submit-staging-website-uat.yml");
    expect(workflow).toContain(".github/workflows/submit-staging-skip-uat.yml");
  });
});
