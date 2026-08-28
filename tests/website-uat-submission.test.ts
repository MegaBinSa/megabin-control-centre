import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readWebsiteUatConfig,
  submitWebsiteUat,
  validateWebsiteUatPlan
} from "../scripts/website-uat-submission.mjs";

const sourceSha = "3fb6707b490d72bdc21ec0f0555704e6976c92b0";
const sourceSubmissionId = "uat:web:UAT-WEB-001:20260825:01";
const projectRef = "xniweqdmswzljcgkfglx";
const base = {
  environment: "staging",
  projectRef,
  supabaseUrl: `https://${projectRef}.supabase.co`,
  onboardingUrl: `https://${projectRef}.supabase.co/functions/v1/website-onboarding`,
  integrationKey: "megabin-website-onboarding-staging",
  integrationSecret: "protected-synthetic-secret",
  sourceSha,
  sourceSubmissionId,
  mode: "initial_submission",
  confirmation: `SUBMIT-UAT-WEB-001:${projectRef}:${sourceSubmissionId}:${sourceSha}:initial_submission`,
  workflowRunId: "123",
  workflowRunAttempt: "1",
  operator: "synthetic-operator"
};

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("protected Website UAT submission", () => {
  it("accepts only the exact repository-approved Staging plan", async () => {
    const config = await readWebsiteUatConfig();
    expect(validateWebsiteUatPlan(config, base)).toMatchObject({ ok: true, errors: [] });

    const unsafe = validateWebsiteUatPlan(config, {
      ...base,
      projectRef: "production-project-ref",
      supabaseUrl: "https://production-project-ref.supabase.co",
      sourceSubmissionId: "arbitrary-intake"
    });
    expect(unsafe.ok).toBe(false);
    expect(unsafe.errors.join(" ")).toContain("Production references are forbidden");
    expect(unsafe.errors.join(" ")).toContain("Environment project reference mismatch");
    expect(unsafe.errors.join(" ")).toContain("reserved source submission identity");
  });

  it("submits the immutable payload and writes only sanitized evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "megabin-website-uat-"));
    temporaryDirectories.push(directory);
    const evidencePath = join(directory, "evidence.json");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Integration-Secret")).toBe(base.integrationSecret);
      expect(headers.get("Idempotency-Key")).toBe(sourceSubmissionId);
      expect(JSON.parse(String(init?.body)).sourceSubmissionId).toBe(sourceSubmissionId);
      return Response.json(
        {
          ok: true,
          data: { submissionId: "70000000-0000-0000-0000-000000000001", duplicate: false }
        },
        { status: 202 }
      );
    });

    const evidence = await submitWebsiteUat(
      { ...base, evidencePath },
      fetchMock as unknown as typeof fetch
    );
    expect(evidence).toMatchObject({
      result: "Passed",
      httpStatus: 202,
      duplicate: false,
      sourceSubmissionId
    });
    const serialized = await readFile(evidencePath, "utf8");
    expect(serialized).not.toContain(base.integrationSecret);
    expect(serialized).not.toContain("example.invalid");
    expect(serialized).not.toContain("Synthetic UAT Website Contact");
  });

  it("supports an exact idempotent retry without changing identity or payload", async () => {
    const directory = await mkdtemp(join(tmpdir(), "megabin-website-uat-"));
    temporaryDirectories.push(directory);
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          ok: true,
          data: { submissionId: "70000000-0000-0000-0000-000000000001", duplicate: true }
        },
        { status: 200 }
      )
    );
    const mode = "idempotency_retry";
    const evidence = await submitWebsiteUat(
      {
        ...base,
        mode,
        confirmation: `SUBMIT-UAT-WEB-001:${projectRef}:${sourceSubmissionId}:${sourceSha}:${mode}`,
        evidencePath: join(directory, "retry.json")
      },
      fetchMock as unknown as typeof fetch
    );
    expect(evidence).toMatchObject({ result: "Passed", httpStatus: 200, duplicate: true });
  });

  it("keeps the workflow manual, protected, main-bound and free of database mutation commands", () => {
    const workflow = readFileSync(".github/workflows/submit-staging-website-uat.yml", "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/\b(push|schedule):/);
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("group: megabin-shared-staging");
    expect(workflow).toContain('test "$(git rev-parse origin/main)" = "$SOURCE_SHA"');
    expect(workflow).toContain("${{ secrets.WEBSITE_ONBOARDING_SECRET }}");
    expect(workflow).toContain("scripts/website-uat-submission.mjs");
    expect(workflow).toContain("if-no-files-found: warn");
    expect(workflow).not.toMatch(/supabase db (reset|push|query)/);
    expect(workflow).not.toMatch(/\b(truncate|delete from|drop schema)\b/i);
    expect(workflow).not.toMatch(/echo.*WEBSITE_ONBOARDING_SECRET/i);
  });
});
