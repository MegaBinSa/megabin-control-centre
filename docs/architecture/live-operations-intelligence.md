# Live Operations Intelligence

**Status:** Phase 3C foundation implemented

## Boundary and truth

Operational Intelligence interprets protected GPS observations, the current-position projection, Published Route geometry, immutable Route Operation manifests and stops, authoritative Driver outcomes, planned operating windows, depots, territories, and regions. It owns derived operational facts and the live progress projection. Needs Attention owns review items referencing those facts.

Inference never edits raw GPS, Published Routes, Route Operations, Driver stop results, master geography, or roster truth. Driver outcomes take precedence in progress counts. `inferred` and `authoritative` are always labelled separately.

## Derived facts, confidence, and evidence

A fact has an immutable ID; type; vehicle, region, and optional operation/stop; detection and evidence window; `low`, `medium`, or `high` confidence; conservative `info`, `warning`, or `critical` severity; lifecycle; stable deduplication key; rule version; route/manifest version; summary; concise evidence; and resolution metadata.

Evidence stores observation references and aggregates such as count, accuracy, dwell, distance, duration, and expected-versus-actual timing. It does not copy full GPS histories. Confidence increases only with sufficient good-quality supporting observations. Low-quality points may be retained as tracking history but are excluded from inference.

## Deterministic rules

Typed configuration controls arrival and departure radii, dwell, corridor tolerance and consecutive evidence, stationary duration/radius, late-start tolerance, inter-stop multiplier, outside-hours grace, area tolerance, GPS quality, completion tolerance, and deduplication window. Facts retain `ruleVersion`, source Route Version, manifest revision, and evidence timestamps.

- Arrival requires multiple accurate points within the derived stop radius and sufficient dwell. Departure requires subsequent evidence outside the wider departure radius.
- Route deviation requires consecutive good-quality positions outside the Published route corridor. Recovery resolves the continuous active fact without erasing it.
- Stationary detection excludes expected stop/depot dwell and does not infer a reason.
- Late start, inter-stop delay, deterministic schedule risk, completion timing, outside-hours movement, and unexpected-area movement remain advisory facts.
- Current/next stop and progress are projections. Authoritative Driver outcomes always win.

The initial corridor evaluator uses provider-neutral normalized geometry supplied by the application layer. PostGIS-backed source geometry and spatial indexes remain the authoritative persistence strategy; no alternate route geometry is created.

## Processing and failure isolation

The pure rule evaluator consumes a bounded operation snapshot and emits at most 100 normalized signals plus one progress projection. The application RPC reauthorizes the region, applies signals idempotently, deduplicates continuous facts, and writes fact, Needs Attention, and outbox state transactionally. A per-vehicle checkpoint supports incremental windows. A scheduler may invoke this boundary after tracking updates; GPS ingestion never waits for inference, and one processing failure cannot roll back tracking or route execution.

Indexes support open facts by region, recent facts by vehicle, facts by operation/type, open Needs Attention, and live progress by region. The design avoids per-point full-history scans.

## Human review and access

Office reviewers may acknowledge, resolve, or dismiss a false positive with a reason. Evidence is immutable through review APIs. Human actions are audited; automatic evaluations are not. Low-volume fact and Needs Attention lifecycle events use the durable outbox.

Location-derived intelligence is sensitive operational data. Region scope is mandatory. Driver/Team and technical roles receive no all-fleet intelligence by default. Raw GPS and derived tables remain private and unavailable to browsers.

## Limitations and deferrals

Schedule risk is deterministic progress-versus-time classification, not predictive ETA. Browser tracking gaps, sparse route geometry, GPS noise, road detours, and incomplete operating-window policy reduce confidence. Phase 3C does not implement automatic route changes, live re-optimization, messaging, historical playback, payroll interpretation, disciplinary workflows, or ML anomaly detection.
