import { createHash, timingSafeEqual } from "node:crypto";
import { appendFile } from "node:fs/promises";

const MANAGEMENT_API = "https://api.supabase.com/v1";
const APPROVED_PROJECT_REF = "xniweqdmswzljcgkfglx";

const probes = Object.freeze([
  ["project_status", `/projects/${APPROVED_PROJECT_REF}`],
  ["postgrest_status", `/projects/${APPROVED_PROJECT_REF}/postgrest`],
  ["pooler_status", `/projects/${APPROVED_PROJECT_REF}/config/database/pooler`]
]);

function requireExactEnvironment(values) {
  if (values.MEGABIN_ENVIRONMENT !== "staging")
    throw new Error("The PAT diagnostic is restricted to staging.");
  if (values.SUPABASE_PROJECT_REF !== APPROVED_PROJECT_REF)
    throw new Error("The PAT diagnostic is restricted to the approved Shared Staging project.");
  if (!values.SUPABASE_ACCESS_TOKEN)
    throw new Error("SUPABASE_ACCESS_TOKEN is required from the protected staging Environment.");
}

function compareFingerprint(token, expected) {
  if (!/^[a-fA-F0-9]{64}$/.test(expected))
    throw new Error("SUPABASE_ACCESS_TOKEN_SHA256 must be a 64-character SHA-256 value.");
  const actualBuffer = Buffer.from(createHash("sha256").update(token).digest("hex"), "ascii");
  const expectedBuffer = Buffer.from(expected.toLowerCase(), "ascii");
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function runSupabasePatPermissionDiagnostic(
  values,
  fetchImpl = fetch,
  writeOutput = () => Promise.resolve()
) {
  requireExactEnvironment(values);
  const headers = { Authorization: `Bearer ${values.SUPABASE_ACCESS_TOKEN}` };
  const results = {};

  for (const [name, path] of probes) {
    const response = await fetchImpl(`${MANAGEMENT_API}${path}`, {
      method: "GET",
      headers,
      redirect: "error"
    });
    results[name] = response.status;
    await writeOutput(name, String(response.status));
  }

  if (values.VERIFY_TOKEN_FINGERPRINT === "true") {
    const matches = compareFingerprint(
      values.SUPABASE_ACCESS_TOKEN,
      values.SUPABASE_ACCESS_TOKEN_SHA256 ?? ""
    );
    results.token_fingerprint_matches = matches;
    await writeOutput("token_fingerprint_matches", String(matches));
  }

  return results;
}

if (process.argv[1]?.endsWith("supabase-pat-permission-diagnostic.mjs")) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const result = await runSupabasePatPermissionDiagnostic(
    process.env,
    undefined,
    outputPath
      ? async (name, value) => appendFile(outputPath, `${name}=${value}\n`, { encoding: "utf8" })
      : () => Promise.resolve()
  );

  console.log(`project_status: ${result.project_status}`);
  console.log(`postgrest_status: ${result.postgrest_status}`);
  console.log(`pooler_status: ${result.pooler_status}`);
  if ("token_fingerprint_matches" in result)
    console.log(`token_fingerprint_matches: ${result.token_fingerprint_matches}`);
}
