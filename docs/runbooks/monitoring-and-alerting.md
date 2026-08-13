# Monitoring and Alerting Runbook

The minimum Staging dashboard covers runtime/database/integration/job health, Edge Function error rate, failed/background jobs, outbox backlog, route-planning failures, GPS ingestion and stale tracking, website intake failures, accounting sync failures and communication failure/fallback/webhook counts. Logs include environment, build/deployment identity and correlation IDs and exclude secrets, recipients, message bodies, invoice/customer payloads and raw location trails.

The hourly `Monitor staging` workflow runs non-mutating synthetic availability, authentication, authorization, CORS and provider-health checks against both frontends and the runtime. GitHub records failures and its native Actions notifications can notify repository participants. This is technical monitoring, not an owned operational alert route.

SEV1 pages the assigned technical and operations owners; SEV2 creates prompt owned attention during the support window; SEV3 enters the reviewed backlog. Until an alert provider/channel and recipients are approved, GitHub workflow failures, Supabase logs/health and manual dashboard checks provide visibility only—not operational alerting. `PRD-OPS-001` therefore remains In progress.
