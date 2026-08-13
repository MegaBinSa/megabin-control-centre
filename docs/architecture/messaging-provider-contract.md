# Messaging Provider Contract

Adapters expose provider-neutral WhatsApp, SMS, email, health, delivery normalization and inbound normalization capabilities. Provider SDK types, authentication, rate-limit details, signatures, and raw payloads remain inside adapters.

The deterministic fake provider covers success, unavailable/permanent/temporary failure, timeout foundation, rate limiting with retry-after, authentication failure, callbacks and inbound messages. No production vendor is selected in Phase 4E. Production activation requires approved credentials, webhook verification, channel/template registration, test recipients, and an ADR only if the vendor commitment materially constrains architecture.

Provider webhooks require an isolated secret/signature boundary, bounded payload size, replay/idempotency identity, redacted logs, and monotonic state transitions. Secrets are runtime-only and never browser-exposed.
