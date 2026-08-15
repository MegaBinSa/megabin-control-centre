# Production Configuration Register

**Status:** Phase 5A inventory; values are not credentials
**Last reviewed:** 2026-08-15

Phase 5C configured and proved the isolated Supabase project, protected GitHub Staging names/secrets, exact Cloudflare Pages targets and two synthetic Auth identities. Values remain outside the repository. The evidence baseline is `main` at `4e471bd250a2757ca67bb0e843c2201d144ac122`, deployment run 31738092512.

`Current posture` describes repository defaults or absence. Actual secret values must never be recorded here.

| ID/key | Module | Current posture | Production value/decision required | Storage location | Owner type | Blocks |
|---|---|---|---|---|---|---|
| CFG-ENV / `MEGABIN_ENVIRONMENT` | Runtime | Strict `staging` posture deployed and validated | Separate strict production posture | Edge Function secret/config | Technical | Production |
| CFG-SUP-URL / `VITE_SUPABASE_URL` | Both frontends | Isolated Staging project URL configured in protected environment | Separate production project URL later | GitHub Environment/build injection | Technical | Production |
| CFG-SUP-KEY / `VITE_SUPABASE_PUBLISHABLE_KEY` | Both frontends | Staging publishable key configured; privileged-key validation enforced | Separate production publishable key; never service role | GitHub Environment/build injection | Technical | Production |
| CFG-OFF-API / `VITE_MASTER_DATA_API_URL` | Office Web | Staging platform-runtime URL configured and smoke-proven | Separate production platform-runtime URL | Protected build configuration | Technical | Production |
| CFG-DRV-API / `VITE_DRIVER_API_URL` | Driver PWA | Staging platform-runtime URL configured and smoke-proven | Separate production platform-runtime URL | Protected build configuration | Technical | Production |
| CFG-SVC-ROLE | Edge Functions | Staging runtime injection and browser isolation proven | Separate production credential plus rotation procedure | Supabase secret/runtime | Technical/Security | Production |
| CFG-WEB-KEY / `MEGABIN_WEBSITE_ONBOARDING_INTEGRATION_KEY` | Website intake | Seeded Staging identity `megabin-website-onboarding-staging` proven | Distinct production integration identity | Supabase secret/config and website secret store | Website/Technical | Production website |
| CFG-WEB-SECRET / `MEGABIN_WEBSITE_ONBOARDING_SECRET` | Website intake | Protected Staging signing and synthetic intake proven | Separate production signing secret with rotation/overlap procedure | Secret managers at both ends | Website/Technical | Production website |
| CFG-ACC-ORG / `MEGABIN_ACCOUNTING_ORGANIZATION_ID` | Accounting | `local-synthetic` | Approved Zoho organization and data center | Secret/config registry | Finance/Technical | Financial staging |
| CFG-ACC-PAGE / `MEGABIN_ACCOUNTING_PAGE_SIZE` | Accounting | 100 | Provider-limit-based bounded value | Typed runtime config | Technical | Financial staging |
| CFG-ACC-RETRY / `MEGABIN_ACCOUNTING_MAX_RETRY_DELAY_MS` | Accounting | 5000 | Provider-compliant cap/backoff | Typed runtime config | Technical | Financial staging |
| CFG-ZOH-OAUTH | Accounting adapter | Absent | Client ID/secret, refresh token or approved OAuth flow/scopes/rotation | Supabase secret store | Finance/Technical | Live Zoho |
| CFG-COM-MODE / `MEGABIN_COMMUNICATIONS_MODE` | Communications | `capture` | Staging capture/test; production live only behind approved gate | Typed runtime config | Operations/Technical | Live messaging |
| CFG-COM-ALLOW / `MEGABIN_COMMUNICATIONS_TEST_RECIPIENTS` | Communications | Empty | Staging approved synthetic/internal recipients | Protected config | Operations/Technical | Messaging staging |
| CFG-COM-WEBHOOK / `MEGABIN_COMMUNICATIONS_WEBHOOK_SECRET` | Communications | Absent | Per-environment high-entropy webhook verification secret and rotation | Supabase secret store/provider | Technical | Messaging staging |
| CFG-COM-RETRY / `MEGABIN_COMMUNICATIONS_MAX_RETRIES` | Communications | 2 | Provider/channel policy | Typed runtime config | Operations/Technical | Live messaging |
| CFG-COM-CREDS | Messaging adapters | Absent/fake | Channel provider credentials, sender IDs and test/live modes | Supabase secret store | Technical | Live messaging |
| CFG-ROU-CREDS | Routing/optimization | Fake providers | Provider key/account/endpoint and limits | Supabase secret store | Technical | Optimized pilot |
| CFG-GPS-CREDS | Tracking | Browser/local only | Provider/device credentials and webhook signing if external | Supabase secret store | Technical | External tracking |
| CFG-AUTH | Supabase Auth | Local sign-up, unconfirmed email, 6-char password, MFA off | Invite policy, redirects, SMTP, password/session/MFA and bootstrap settings | Supabase project config | Business/Technical/Security | Internal UAT |
| CFG-DB-NET | PostgreSQL | Local open network, SSL/pooler production posture absent | Network/SSL/pooling/connection limits and approved admin access | Supabase project config | Technical/Security | Production |
| CFG-BACKUP | PostgreSQL | One-hour target RPO, four-hour target RTO, Shaun/Sidney authorities and isolated target configured; logical restore and component rollback passed; forward-repair mechanism implemented but Not Run; PITR disabled; RPO unmet | Configure main-only Environment protection plus approved Shaun/Sidney GitHub logins; execute forward repair; obtain independent confirmations; address hourly recovery points and 12-month archive | `staging-recovery`, repository config, Supabase/org operations | Business/Technical | Pilot/Production |
| CFG-DOMAIN | Hosting/Auth | Separate Office and Driver Cloudflare Pages Staging origins configured | Production domains and Auth redirect allowlist later | Cloudflare/GitHub/Supabase | Business/Technical | Production |
| CFG-OBS | Observability | Shaun owns monitoring/escalation; GitHub Actions email to `infomegabin@gmail.com`; SEV1/2 immediate, SEV3 nonurgent; controlled proof passed in run 31878853824 and Shaun confirmed mailbox receipt | Preserve Staging notification settings; decide and prove broader production routing/support posture | GitHub Actions/repository config | Technical/Operations | Production |
| CFG-JOBS | Background jobs | Manual/local foundations | Cadences, concurrency, timeouts, retries, owners and kill switches per job | Typed config/Cron | Operations/Technical | Production |
| CFG-LIVE | Live intelligence | Typed synthetic defaults | Approved regional thresholds and grace windows | Configuration registry | Operations | Production |
| CFG-GPS | Tracking | 45-second local target; 1,000 buffered observations | Provider/device cadence, accuracy floor, batch/storage/retention and outside-hours rules | Configuration registry | Operations/Privacy/Technical | Pilot/Production |
| CFG-FIN | Financial eligibility | Conservative recommendation/manual posture | Policy version, thresholds, stale SLA, auto-hold/release and authority | Configuration registry | Finance/Operations | Financial enforcement |
| CFG-SKIP | Client SKIP | Conservative manual workflow | Timezone/cutoff/near-cutoff, SLA, Draft generation and acknowledgement timing | Configuration registry | Operations | SKIP pilot |
| CFG-RET | Retention | Placeholder/disabled deletion | Approved periods, legal holds and deletion enablement per environment | Configuration registry | Business/Privacy | Production |
| CFG-STORAGE | Evidence storage | No operational bucket/policy | Private bucket, file limits, malware/content policy, signed access and retention | Supabase Storage/project config | Operations/Privacy/Technical | Evidence feature |
| CFG-CORS / `MEGABIN_ALLOWED_ORIGINS` | Edge Functions | Exact Staging Office/Driver origins and unknown-origin denial proven | Separate exact production origins; wildcard rejected | Supabase Function secret/config | Technical | Production |
| CFG-BUILD / `VITE_BUILD_SHA`, `VITE_BUILD_TIMESTAMP`, `VITE_DEPLOYMENT_ID` | Frontends | Workflow-generated Staging identity proven | Preserve for production releases | Hosting build config | Technical | Production |
| CFG-BUILD-RUNTIME / `MEGABIN_BUILD_SHA`, `MEGABIN_BUILD_TIMESTAMP`, `MEGABIN_DEPLOYMENT_ID` | Runtime | Workflow-generated Staging identity proven | Preserve for production releases | Supabase Function secrets | Technical | Production |
| CFG-SAFE-PROVIDERS | Routing/accounting/financial/SKIP | Staging fake/capture/off posture smoke-proven | Explicit production provider and automation decisions | GitHub/Supabase typed config | Technical/Operations | Provider-specific pilot/Production |

## Secret rotation requirements

Every credential needs an owner, creation date, least-privilege scope, staging/production separation, rotation interval, emergency revocation path and overlap procedure where senders/webhooks cannot change atomically. Rotation must be rehearsed for website signing, provider OAuth/API keys, webhook secrets and privileged deployment credentials. Public frontend keys are configuration, not authorization; service-role and provider credentials must never enter frontend bundles.
