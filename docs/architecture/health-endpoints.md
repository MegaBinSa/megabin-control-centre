# Health Endpoints

**Status:** Phase 0B-6 executable proof

| Endpoint | Purpose | Safe response |
|---|---|---|
| `GET /api/v1/health/live` | Confirms the runtime isolate can answer | Status and build ID |
| `GET /api/v1/health/ready` | Confirms required configuration and database availability | Overall status only |
| `GET /api/v1/health` | Internal platform summary | Database, outbox, job runner, adapter, and configuration status |

Responses exclude SQL, credential-bearing URLs, stack traces, provider payloads, personal data, and secrets. Integration degradation changes diagnostics, not authoritative state. Dead letters degrade outbox health while unrelated work may continue.

The OpenAPI 3.1 document is returned at `GET /api/v1/openapi.json` from the implemented handler contract.
