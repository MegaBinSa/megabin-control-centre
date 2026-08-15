export const CORS_ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  "idempotency-key",
  "x-correlation-id"
] as const;

export const CORS_ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"] as const;

export function configuredOrigins(value: string): string[] {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.includes("*")) throw new Error("Wildcard CORS is forbidden.");
  return origins;
}

export function withApprovedCors(
  request: Request,
  response: Response,
  origins: readonly string[]
): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !origins.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS.join(", "));
  headers.set("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS.join(", "));
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
