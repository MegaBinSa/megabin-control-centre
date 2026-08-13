# Provider Decision Register

**Status:** Phase 5A provider-selection register
**Last reviewed:** 2026-08-13

No production vendor is selected by this document.

| ID | Capability | Required capabilities and decision criteria | Current adapter readiness | Blocks | Required next evidence |
|---|---|---|---|---|---|
| PVR-ROU-001 | Routing/directions | South African road coverage; matrices/legs/geometry; 50–80-stop/team scale; traffic need; rate limits; latency; cost; data residency/privacy; health/SLA; retry-after; stable terms | Provider-neutral contract, fake adapter, validation and deterministic fallback complete | Optimized-routing pilot | Candidate comparison and representative staging/road trial |
| PVR-OPT-001 | Route optimization | Multi-vehicle, depots, time windows, capacity, deterministic constraints, explainable infeasibility, route-size quotas, bounded response and pricing | Separate provider-neutral optimizer contract and fake candidates complete | Optimized-routing pilot | Confirm whether one vendor or independent optimizer; validate outcomes with planners |
| PVR-GPS-001 | GPS/tracking | 30–60 second useful updates, locked/background/all-hours operation, offline store-forward, device/vehicle identity, health, privacy, export/API, SLA, hardware/MDM support | Server ingestion and provider-neutral device identity exist; browser producer is foreground-limited | Full production; pilot posture decision | Option decision and vehicle/device field trial |
| PVR-WA-001 | WhatsApp | Business account onboarding, approved templates, inbound/status webhooks, signatures, delivery semantics, South African numbers, sandbox, cost and support | Provider-neutral messaging adapter and deterministic fake complete | Live WhatsApp | Business/vendor approval, sender/template registration and sandbox test |
| PVR-SMS-001 | SMS | South African delivery, sender/number rules, callbacks, throughput, opt-out support, retry-after, sandbox and cost | Provider-neutral channel/fallback contract and fake complete | Live SMS fallback | Candidate trial and approved sender identity |
| PVR-EML-001 | Email | Domain authentication, templates, delivery/bounce callbacks, suppression, throughput, data handling and cost | Provider-neutral email/fallback contract and fake complete | Live email fallback | Provider choice, sending domain, SPF/DKIM/DMARC and sandbox test |
| PVR-ZOH-001 | Zoho Books | Correct data center, organization, OAuth read scopes, refresh/token storage, pagination/rate limits, customers/invoices/payments/credits and webhooks/polling choice | Real-adapter shell plus comprehensive fake; live mode inactive | Financial integration | Finance semantics, OAuth app and synthetic/staging translation tests |
| PVR-HST-001 | Frontend hosting | Office/PWA HTTPS, environment isolation, SPA routing, immutable artifacts, cache/service-worker controls, custom domains, access controls, logs, rollback, regions and cost | Build artifacts exist; no host deployment | Staging onward | Architecture-compatible host comparison and deployment proof |

## Selection principles

Choose against the contract, not SDK convenience. Provider-specific identifiers and payloads remain inside adapters; secrets remain in approved runtime stores; health, retry, rate-limit and idempotency semantics must pass synthetic and sandbox tests; exit/export feasibility and data-processing terms must be reviewed. A material commitment that constrains architecture requires an ADR.
