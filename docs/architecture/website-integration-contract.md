# Website Onboarding Integration Contract

The website calls `POST /api/v1/integrations/website/onboarding` with `X-Integration-Key`, `X-Integration-Secret`, `Idempotency-Key`, and `X-Correlation-Id`. The reusable secret lives only in environment secret storage; the registry stores its environment-variable reference. Credentials are isolated by environment and may be rotated. Local credentials are synthetic.

The website credential can submit and query narrow status only. It cannot call Client, route, tracking, or Office APIs.

Website receipt is hosted by the dedicated `website-onboarding` Edge Function. Its platform JWT check is disabled solely so the function can perform constant-time custom integration-secret verification. That function exposes no Office or operational routes. Office intake APIs remain in the separate user-JWT-protected platform runtime.

## Payload v1.0

```json
{
  "sourceSubmissionId": "signup-123",
  "payloadVersion": "1.0",
  "submittedAt": "2026-08-13T08:00:00+02:00",
  "client": { "type": "individual", "displayName": "Example Person" },
  "contact": { "name": "Example Person", "mobile": "082 123 4567", "email": "person@example.test", "preferredLanguage": "english" },
  "address": { "addressLine1": "1 Example Road", "suburb": "Example", "city": "Pretoria", "postalCode": "0001", "latitude": -25.75, "longitude": 28.2 },
  "requestedDrumCount": 2,
  "requestedStartDate": "2026-08-20",
  "references": { "customerReference": "web-customer-123", "serviceReference": "web-service-123" }
}
```

Unknown fields are rejected. Receipt returns `202` accepted, `200` duplicate, `422` retained validation rejection, `409` changed-payload conflict, or `401` authentication failure. The status endpoint returns only `received`, `under_review`, `activated`, or `rejected`.

The future WordPress adapter must save locally first, preserve `sourceSubmissionId`, retry the identical payload and idempotency key with bounded backoff, and treat acknowledgement as receipt—not activation. It must not synchronously depend on activation or overwrite Control Centre operational data after activation.

Shared-Staging `UAT-WEB-001` uses a manual protected GitHub workflow rather than exposing the integration secret to a browser or operator workstation. Its repository-controlled payload, exact Staging project/identity checks and initial-versus-retry status assertions exercise this same contract without adding another onboarding path. The workflow cannot target Production and never calls database reset, seed or direct-write mechanisms.
