# Deployment Architecture

**Status:** Phase 5C staging implementation; deployment proof awaits the merged release SHA

`CI` remains the prerequisite correctness gate. `Deploy staging` is a manual, serialized workflow against the protected GitHub `staging` Environment. It verifies the SHA is reachable from `main`, validates environment safety, reviews changed migrations, links only the declared project, previews and applies migrations, lints the remote schema, sets named Function secrets, deploys exactly `platform-runtime` and `website-onboarding`, builds traceable frontend artifacts and runs remote smoke tests after the hosting integration reports configured.

Failure stops subsequent steps. A migration failure prevents Functions/frontends; a Function failure prevents artifacts/smoke; missing hosting integration or smoke failure marks the deployment failed. Workflow history, commit SHA, run ID, Function deployment ID and health build metadata form the technical audit trail. No separate deployment ledger is needed.

Production has a documented contract but no active workflow. A future workflow must require a protected Production Environment, main-branch release, explicit approval, migration preview, immutable artifacts, smoke checks and rollback references. It must never be an automatic merge-to-production path.

Staging frontend hosting uses two isolated Cloudflare Pages projects. The protected workflow deploys the exact traceable Office and Driver `dist` artifacts to their respective projects before smoke tests. The projects preserve SPA routing, keep HTML/service-worker discovery fresh, cache hashed assets immutably, and retain Cloudflare deployment history for rollback. This is a staging hosting decision only; production hosting remains undecided.

The shared target remains main-only. Phase changes are locally and CI verified in a draft PR, then the reviewed merge SHA is dispatched. A feature-branch SHA may not update shared Staging.
