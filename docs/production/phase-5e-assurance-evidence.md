# Phase 5E Assurance Evidence

**Status:** Recovery, alert-delivery, component-rollback and isolated forward-repair rehearsals Passed; UAT-DRV-001 Passed and five synthetic UAT journeys remain

## Approved decisions

Shaun is the primary monitoring and escalation owner and recovery authority. GitHub Actions workflow notifications are the approved alert mechanism for `infomegabin@gmail.com`; SEV1 and SEV2 require immediate email and SEV3 requires email without urgent escalation. Sidney is the independent recovery verifier.

The target RPO is one hour and target RTO is four hours. Staging remains Supabase Free with PITR disabled. Therefore the RPO is approved but not achieved. The approved recovery path is an operator-triggered logical dump from `xniweqdmswzljcgkfglx` into disposable isolated project `ivtaoqorcryzsempsogs`. A successful run may prove observed RTO and restore integrity; it cannot prove managed backup, PITR or continuous one-hour recoverability.

The assurance evidence retention target is 12 months. This repository is public, so GitHub Actions artifacts are limited to 90 days. Workflow artifacts are evidence for review, but the 12-month retention target remains unmet until an approved durable evidence archive exists.

## Execution boundary

Recovery rehearsal #6 passed on main SHA `dcd7383594ed6a89379da35de0b5f82accd70661` in [run 31877345920](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31877345920). The isolated logical restore completed in 296 seconds and passed migration, schema, synthetic-reference, persona-link, regional authorization, Driver/Office and Driver/financial-isolation checks. The recovery evidence artifact is documented in [Restore Rehearsal Evidence](restore-rehearsal-evidence.md). Sidney's independent confirmation remains pending.

The controlled synthetic alert-delivery proof passed in [run 31878853824](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31878853824). All normal checks resolved, the requested `MBA-STG-MON-TEST-001` alert caused the intended workflow failure, and its evidence artifact was retained. Shaun separately confirmed receipt of the GitHub Actions failure email at `infomegabin@gmail.com`; mailbox receipt was human-confirmed, not programmatically verified.

Component rollback/current-release restoration passed in [run 31881010706](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31881010706). The compatible prior application release `4e471bd250a2757ca67bb0e843c2201d144ac122` deployed and passed smoke verification; current main release `e2837def54f922649965298e27f97357977b0dd0` was then restored and passed the complete smoke suite. No database migration, downgrade or reset occurred. Bounded synthetic provisioning and website-intake smoke operations did run.

The isolated database forward-repair rehearsal passed in [run 31906816621](https://github.com/MegaBinSa/megabin-control-centre/actions/runs/31906816621) from main SHA `1f3a91ffe831e5039716a4fc5bc7fcc2a229d1e9`. Protected Environment approval and exact dispatch/baseline validation passed. Fault migration `20990101000001` applied only to the isolated target and produced exactly `MBA-FR-EXPECTED-001`; immutable repair migration `20990101000002` then applied and restored the invariant. Restored-data, regional authorization, Driver Office/financial denial, Driver linkage and critical RLS checks passed. Shared Staging identity was unchanged and the artifact records zero Staging writes. The isolated target remains intact for Sidney's independent post-run review.

The one-hour RPO and 12-month evidence-retention targets remain unmet. `UAT-DRV-001` passed on Shared Staging release `c74bea8b7f09d572c9d1f12182d3082eca063de6`; the other five release-bound UAT journeys remain Not Run or Blocked. No production system, live provider or real client data was involved.

## Current evidence state

| Capability | Result | Evidence or blocker |
|---|---|---|
| Isolated logical restore | Passed | Run 31877345920; 296 seconds; automated integrity checks passed |
| Independent restore verification | Blocked/pending | Sidney must review and confirm the evidence artifact |
| One-hour RPO | Blocked | No PITR or retained hourly logical snapshot process |
| Twelve-month assurance retention | Blocked | Current artifact expires after 90 days |
| Synthetic alert delivery | Passed | Run 31878853824 and monitoring artifact; Shaun confirmed mailbox receipt |
| Component rollback/restoration | Passed | Run 31881010706; prior deployed and current release restored with smoke checks |
| Database forward repair | Passed | Run 31906816621; expected fault proven, immutable repair applied, post-repair integrity/security passed, zero Staging writes |
| Independent forward-repair review | Pending | Sidney must review and confirm artifact 9252603931; Environment approval alone is not post-run evidence acceptance |
| Six synthetic UAT journeys | In progress | `UAT-DRV-001` Passed with release-bound manual evidence; five journeys remain Not Run or Blocked |
