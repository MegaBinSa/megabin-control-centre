const managementApi = "https://api.supabase.com/v1";

function schemas(value) {
  return String(value ?? "")
    .split(",")
    .map((schema) => schema.trim())
    .filter(Boolean);
}

export async function ensureSupabaseDataApiSchema(values, fetchImpl = fetch) {
  const projectRef = values.SUPABASE_PROJECT_REF;
  const accessToken = values.SUPABASE_ACCESS_TOKEN;
  if (!projectRef || !accessToken)
    throw new Error("Supabase project ref and access token are required.");

  const url = `${managementApi}/projects/${encodeURIComponent(projectRef)}/postgrest`;
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const read = async () => {
    const response = await fetchImpl(url, { headers });
    if (!response.ok)
      throw new Error(`Unable to read hosted PostgREST configuration (${response.status}).`);
    return response.json();
  };

  const current = await read();
  const configured = schemas(current.db_schema);
  if (!configured.includes("api")) {
    const response = await fetchImpl(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ db_schema: [...configured, "api"].join(",") })
    });
    if (!response.ok)
      throw new Error(`Unable to expose the application API schema (${response.status}).`);
  }

  const verified = schemas((await read()).db_schema);
  if (!verified.includes("api"))
    throw new Error("Hosted PostgREST configuration does not expose api.");
  return { changed: !configured.includes("api"), schemas: verified };
}

if (process.argv[1]?.endsWith("ensure-supabase-data-api-schema.mjs")) {
  const result = await ensureSupabaseDataApiSchema(process.env);
  console.log(
    `Hosted Data API contract verified (${result.changed ? "updated" : "unchanged"}): ${result.schemas.join(",")}`
  );
}
