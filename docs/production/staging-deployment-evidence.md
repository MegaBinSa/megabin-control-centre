# Phase 5C Staging Deployment Evidence

**Status:** Validated shared-staging baseline

**Evidence date:** 2026-08-13

## Validated release

| Item | Evidence |
|---|---|
| Source release | `main` at `4e471bd250a2757ca67bb0e843c2201d144ac122` |
| Protected deployment | [GitHub Actions run 31738092512](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31738092512), terminal success |
| Supabase target | Isolated Staging project `xniweqdmswzljcgkfglx` |
| Office Web | `https://megabin-office-staging.pages.dev` |
| Driver PWA | `https://megabin-driver-staging.pages.dev` |
| Data posture | Deterministic synthetic seed and synthetic personas only |
| Provider posture | Routing/accounting fakes and communications capture mode; no live providers |

The run accepted a reachable `main` SHA through the protected GitHub `staging` Environment. It passed environment validation and the normal CI gate before changing Staging. The final website onboarding configuration used the seeded synthetic integration identity `megabin-website-onboarding-staging`.

## Proven controls

The successful run provides shared-environment evidence for:

- main-only protected deployment and traceable release identity;
- migration inventory, preview, application, remote history reconciliation and application-schema linting;
- hosted Data API exposure of only the configured `public`, `graphql_public` and `api` schemas;
- idempotent synthetic Office and Driver persona provisioning through database-owned roles, permissions, region scopes and Driver staff/team relationships;
- positive Office/Driver authentication checks plus negative global-scope, Office-permission and Driver financial-access checks;
- deployment-equivalent Edge Function bundle validation, secret injection and deployment of `platform-runtime` and `website-onboarding`;
- exact Office and Driver build artifacts deployed to separate Cloudflare Pages projects;
- release identity, allowed-origin CORS and unknown-origin denial;
- authenticated Office and Driver API access;
- fake routing/accounting health and capture communications health without enabling live mode;
- authenticated, signed synthetic website onboarding through the integration boundary; and
- the complete non-destructive remote smoke suite reaching terminal success.

This proves the reproducible shared-staging deployment path. It does not prove production recovery, operational alert response, real-provider behavior, real-data migration, real-device behavior, business UAT or production cutover.

## Evidence still required

- Select monitoring destinations, alert recipients, severity ownership, acknowledgement and escalation rules, then prove alert delivery.
- Select the Supabase backup/PITR posture and accountable owner.
- Approve RPO and RTO objectives.
- Provide an isolated restore-rehearsal target and perform a non-destructive restore test.
- Rehearse deployment rollback and migration recovery against an approved recovery plan.
- Complete the outstanding business, security, privacy, retention, provider, device and support decisions in the production registers.

