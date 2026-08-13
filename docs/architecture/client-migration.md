# Client Migration and Reconciliation

**Status:** Phase 4B implemented foundation

Client Migration owns immutable migration batches, source-row snapshots, versioned canonical interpretations, reconciliation classifications, reviewed action plans, dry-run summaries, row outcomes, and provenance. It never owns activated Client, Contact, Address, Service, Configuration, Geography, or Team records.

The Phase 4B source adapter accepts canonical UTF-8 CSV or canonical JSON. Files are parsed as values only, bounded to 5 MB and 5,000 rows, and formula-like cells are rejected. The complete file is not stored: its SHA-256 hash, exact row payloads, mapping version, and source reference provide the secure source snapshot. Actual production input must remain outside source control.

## Canonical row and mapping

`canonical-v1` maps named columns rather than positions. Required fields are legacy client reference, client/contact names, structured address, drum count, collection day, and legacy status. Optional fields include organisation, phone/email, coordinates, billing/agreement references, service start, and team. Source-specific adapters may map changing spreadsheet columns into this contract without changing reconciliation logic.

Normalization reuses Website Intake conventions for South African phone numbers, lower-case email, trimmed names/address, ISO dates, and numeric coordinates/counts. Raw values remain in the immutable source row. Legacy status maps explicitly to independent Client/Service lifecycle plans; ambiguous text requires review and billing status remains only source context.

## Matching and dry run

Client matching uses external reference, normalized phone, or email; names alone never merge. Address matching uses exact normalized structured fields, with geography derived through PostGIS territory candidates. Client and Address matches remain independent, supporting multiple clients at one property. Service duplication requires the matched Client plus Address and an active Service. Team mapping uses explicit versioned keys. Source day, team, territory, and drum count remain visible beside suggestions and existing values.

Dry-run reads proposed plans and produces would-create/link/update/no-change/conflict counts without invoking owning APIs or writing authoritative entities. Batch approval freezes mapping version, processing version, counts, and reviewed plans. Conflicts cannot be bulk-approved; only homogeneous no-warning/no-change cases are candidates for future narrow bulk helpers.

## Activation and recovery

Approved plans activate through existing owning APIs. Stable per-row action identities make retries idempotent. Rows commit independently; technical failures can retry with optimistic attempt checks, while business conflicts cannot. Provenance links every affected entity to its batch and row. Recovery is inspection plus reasoned compensating/manual correction—never blind deletion or generic rollback. Phase 4B does not perform production cutover.

Batch lifecycle used now is `Created -> Uploaded -> Validating -> Needs Review -> Dry Run Complete -> Approved -> Activating -> Completed | Completed With Exceptions`. `Failed`, `Cancelled`, and `Archived` are reserved states. A mixed-region batch requires global batch permission; row review becomes region-scoped once geography is known.
