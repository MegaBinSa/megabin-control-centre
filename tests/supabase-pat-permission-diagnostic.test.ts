import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { runSupabasePatPermissionDiagnostic } from "../scripts/supabase-pat-permission-diagnostic.mjs";

const projectRef = "xniweqdmswzljcgkfglx";
const token = "synthetic-protected-token";
const base = {
  MEGABIN_ENVIRONMENT: "staging",
  SUPABASE_PROJECT_REF: projectRef,
  SUPABASE_ACCESS_TOKEN: token,
  VERIFY_TOKEN_FINGERPRINT: "false"
};

describe("protected Supabase PAT permission diagnostic", () => {
  it("performs exactly the three approved GET requests and never reads response bodies", async () => {
    const bodyReads = vi.fn();
    const fetchMock = vi.fn(async () => ({ status: 200, text: bodyReads, json: bodyReads }));
    const outputs: [string, string][] = [];

    await expect(
      runSupabasePatPermissionDiagnostic(
        base,
        fetchMock as unknown as typeof fetch,
        (name, value) => {
          outputs.push([name, value]);
          return Promise.resolve();
        }
      )
    ).resolves.toEqual({ project_status: 200, postgrest_status: 200, pooler_status: 200 });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `https://api.supabase.com/v1/projects/${projectRef}`,
      `https://api.supabase.com/v1/projects/${projectRef}/postgrest`,
      `https://api.supabase.com/v1/projects/${projectRef}/config/database/pooler`
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ method: "GET", redirect: "error" });
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${token}`);
      expect(init).not.toHaveProperty("body");
    }
    expect(bodyReads).not.toHaveBeenCalled();
    expect(outputs).toEqual([
      ["project_status", "200"],
      ["postgrest_status", "200"],
      ["pooler_status", "200"]
    ]);
  });

  it("optionally compares a protected fingerprint and exposes only a boolean", async () => {
    const outputs: [string, string][] = [];
    const expected = createHash("sha256").update(token).digest("hex");
    const result = await runSupabasePatPermissionDiagnostic(
      {
        ...base,
        VERIFY_TOKEN_FINGERPRINT: "true",
        SUPABASE_ACCESS_TOKEN_SHA256: expected
      },
      vi.fn(async () => new Response(null, { status: 204 })),
      (name, value) => {
        outputs.push([name, value]);
        return Promise.resolve();
      }
    );

    expect(result.token_fingerprint_matches).toBe(true);
    expect(outputs.at(-1)).toEqual(["token_fingerprint_matches", "true"]);
    expect(JSON.stringify({ result, outputs })).not.toContain(token);
    expect(JSON.stringify({ result, outputs })).not.toContain(expected);
  });

  it("fails closed for any non-approved environment or project", async () => {
    const fetchMock = vi.fn();
    await expect(
      runSupabasePatPermissionDiagnostic(
        { ...base, SUPABASE_PROJECT_REF: "production-project" },
        fetchMock
      )
    ).rejects.toThrow("approved Shared Staging project");
    await expect(
      runSupabasePatPermissionDiagnostic({ ...base, MEGABIN_ENVIRONMENT: "production" }, fetchMock)
    ).rejects.toThrow("restricted to staging");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the workflow manual, main-bound, protected and strictly read-only", () => {
    const workflow = readFileSync(".github/workflows/diagnose-supabase-pat.yml", "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/\b(push|pull_request|schedule|workflow_call):/);
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain('test "$GITHUB_REF" = "refs/heads/main"');
    expect(workflow).toContain('test "$SOURCE_SHA" = "$(git rev-parse origin/main)"');
    expect(workflow).toContain(`SUPABASE_PROJECT_REF: ${projectRef}`);
    expect(workflow).toContain("scripts/supabase-pat-permission-diagnostic.mjs");
    expect(workflow).not.toMatch(/supabase\s+(link|db|migration|functions|secrets)/);
    expect(workflow).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/);
    expect(workflow).not.toMatch(/\b(sql|migration|seed|reset|truncate|deploy|smoke)\b/i);
    expect(workflow).not.toMatch(/echo.*SUPABASE_ACCESS_TOKEN/i);
  });
});
