# Deployment Architecture

**Status:** Phase 5C shared-staging deployment validated

`CI` remains the prerequisite correctness gate. `Deploy staging` is a manual, serialized workflow against the protected GitHub `staging` Environment. It verifies the SHA is reachable from `main`, validates environment safety, reviews changed migrations, links only the declared project, idempotently reconciles the hosted PostgREST exposed-schema setting so the database-owned `api` boundary is reachable by the service-role Function client, previews and applies migrations, lints the remote schema, verifies deployment-equivalent Deno bundles, sets named Function secrets, deploys exactly `platform-runtime` and `website-onboarding`, builds traceable frontend artifacts and runs remote smoke tests after the hosting integration reports configured.

Shared packages retain NodeNext `.js` source specifiers so emitted JavaScript remains valid in Node. Each Edge Function owns an explicit `deno.json` import map that maps package entry points and every reachable `.js` source URL to its `.ts` implementation. Sloppy import resolution is disabled. CI checks completeness of both maps, type-checks both graphs and produces standalone Deno bundles before the protected deployment can ask Supabase to bundle them remotely.

Failure stops subsequent steps. A migration failure prevents Functions/frontends; a Function failure prevents artifacts/smoke; missing hosting integration or smoke failure marks the deployment failed. Workflow history, commit SHA, run ID, Function deployment ID and health build metadata form the technical audit trail. No separate deployment ledger is needed.

Hosted Supabase gateway preflight responses are platform-owned and may advertise wildcard CORS before Function code executes. Smoke checks therefore verify the gateway preflight separately, accept the platform header on an allowed actual request, and prove unknown origins are denied by the Function on the actual request. CORS is defense in depth; authentication, application permissions and region scope remain the authorization boundary.

The shared Office staging persona remains region-scoped. It proves normal Office access and denial of global provider-health administration; staging fake/capture provider selection is instead a fail-closed environment invariant. Driver accounting list endpoints require the accounting permission before applying region filters, so an unauthorized caller cannot infer a successful financial projection from an empty list. Website intake configuration must use the seeded enabled staging integration identity, and registry authentication failures are returned as authentication failures rather than generic runtime errors.

Production has a documented contract but no active workflow. A future workflow must require a protected Production Environment, main-branch release, explicit approval, migration preview, immutable artifacts, smoke checks and rollback references. It must never be an automatic merge-to-production path.

Staging frontend hosting uses two isolated Cloudflare Pages projects. The protected workflow deploys the exact traceable Office and Driver `dist` artifacts to their respective projects before smoke tests. The projects preserve SPA routing, keep HTML/service-worker discovery fresh, cache hashed assets immutably, and retain Cloudflare deployment history for rollback. This is a staging hosting decision only; production hosting remains undecided.

Wrangler is an exact root development dependency and the lockfile is authoritative. The protected workflow verifies that exact executable before either pinned Cloudflare action runs and explicitly selects pnpm. The action must use the installed Wrangler; it may not dynamically add deployment tooling or relax workspace-root safety.

The shared target remains main-only. Phase changes are locally and CI verified in a draft PR, then the reviewed merge SHA is dispatched. A feature-branch SHA may not update shared Staging.

The first complete evidence baseline is `main` at `4e471bd250a2757ca67bb0e843c2201d144ac122`, [GitHub Actions run 31738092512](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31738092512). It passed the full protected path through remote smoke checks. This validates deployment repeatability, not recovery, operational monitoring, provider readiness or production cutover.
