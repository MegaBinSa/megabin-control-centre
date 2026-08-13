# Office Website Intake Workflow

1. Open **Website Intake** and filter the queue.
2. Compare submitted, normalized, existing authoritative, suggested, and approved values.
3. Resolve Client and Service Address choices; multiple Clients may share one address.
4. Confirm drums, effective start, region, territory, depot, permanent team, and collection day.
5. Approve to freeze the activation decision, or reject with a reason.
6. Activate. The transaction creates or links authoritative records and references once.

A stale review returns `409`; reload before acting. Rejected and activated intake remains historically visible. Never link records manually in the database.
