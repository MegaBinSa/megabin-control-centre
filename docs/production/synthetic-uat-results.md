# Synthetic UAT Results

**Status:** Blocked at the first Office browser bootstrap; no journey has Passed

| Case | Journey | Result | Evidence/blocker |
|---|---|---|---|
| `UAT-OFF-001` | Office operational planning | Blocked | Release `42db74e8da814e20e5bedc5a564f62cdeafa0a78`: Supabase password authentication succeeded, but the hosted runtime's generic preflight omitted the browser client's `x-correlation-id` header. The approved-origin runtime fix and browser-equivalent deployment smoke gate must be reviewed, merged and deployed before the case resumes. |
| `UAT-DRV-001` | Driver execution/offline synchronization | Not Run | Protected execution and device/network evidence required |
| `UAT-WEB-001` | Website onboarding | Not Run | Protected execution required |
| `UAT-SKP-001` | Client SKIP/replan | Not Run | Protected execution required |
| `UAT-FIN-001` | Accounting/financial boundary | Not Run | Protected execution required |
| `UAT-TRK-001` | Tracking/intelligence | Not Run | Protected execution required |

Results may change only with release-bound evidence containing every catalogue field. Local unit, pgTAP and Playwright tests support readiness but are not substituted for shared-Staging UAT.

The `UAT-OFF-001` attempt stopped at Step 1 before any operational UAT data was created or changed. It must resume from authentication on a newly deployed, smoke-verified release; the failed attempt is not a partial Pass.
