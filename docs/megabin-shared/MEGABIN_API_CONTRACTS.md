# MegaBin API Contracts

> **Document status: legacy/source context.** These are existing website contracts and possible future integration points, not approved Control Centre API contracts.

This document describes current machine-to-machine interfaces that the future Control Centre may need to replace, consume, or support.

No secrets, private tokens, or raw credential values are included.

## Contract: WordPress -> Google Apps Script Sync Webhook

```text
Source
  MegaBin WordPress plugin

Destination
  Google Apps Script web app

Trigger
  Sync queue processing after a recurring signup or once-off request is saved locally.

Endpoint
  Configured in WordPress setting google_sheets_webhook_url.

Method
  POST

Authentication
  Shared secret configured in WordPress setting google_sheets_webhook_secret and Apps Script property MEGABIN_WEBHOOK_SECRET.
  PHP sends the secret in JSON and compatibility headers.
  Apps Script currently validates the JSON secret.

Relevant implementation
  wp-content/plugins/megabin-onboarding/includes/Sheet_Sync.php
  scripts/google-apps-script/megabin-onboarding-webhook.gs
```

### Request Schema

```json
{
  "spreadsheet_id": "configured spreadsheet identifier",
  "target_tab": "Recurring Signups",
  "record_type": "recurring_signup",
  "record_id": 123,
  "reference": "MB-YYYYMMDD-XXXXXXXX",
  "payload": {
    "Signup Reference": "MB-YYYYMMDD-XXXXXXXX",
    "Sync Status": "synced"
  },
  "secret": "configured shared secret"
}
```

For once-off requests:

```json
{
  "spreadsheet_id": "configured spreadsheet identifier",
  "target_tab": "Once-Off Requests",
  "record_type": "once_off_request",
  "record_id": 123,
  "reference": "MBONCE-YYYYMMDD-XXXXXXXX",
  "payload": {
    "Request Reference": "MBONCE-YYYYMMDD-XXXXXXXX",
    "Sync Status": "synced"
  },
  "secret": "configured shared secret"
}
```

The actual payload includes all mapped Sheet columns documented in `MEGABIN_DATA_MODEL.md`.

### Response Schema

Success:

```json
{
  "ok": true
}
```

Failure:

```json
{
  "ok": false,
  "error": "Human-readable error"
}
```

### Success Behaviour

- Apps Script ensures the target tab and headers exist.
- If a row with the same reference exists, Apps Script updates that row.
- If no row exists, Apps Script appends a new row.
- WordPress marks queue item as `synced`.
- WordPress updates source record sync status to `synced`.

### Failure Behaviour

- HTTP errors or `ok: false` responses mark the queue item as `failed`.
- Last response code and error are stored.
- Source record sync status becomes `sync_failed`.
- Repeated failures trigger an office alert.

### Retry Behaviour

- WordPress cron processes queued/failed items.
- Admin can process pending queue items manually.
- Queue status and attempt count are stored in `wp_megabin_sync_queue`.

## Contract: Google Apps Script Health Check

```text
Source
  Browser/admin/operator

Destination
  Google Apps Script web app

Trigger
  GET request to Apps Script web app URL.

Endpoint
  Configured Apps Script web app URL.

Method
  GET

Authentication
  No secret required for basic health response.

Relevant implementation
  scripts/google-apps-script/megabin-onboarding-webhook.gs
```

Expected response:

```json
{
  "ok": true,
  "service": "MegaBin Google Sheets webhook",
  "version": "1.1.0"
}
```

## Contract: Public Weekly Signup Form

```text
Source
  Public website visitor browser

Destination
  WordPress admin-post handler

Trigger
  Submit weekly signup form.

Endpoint
  WordPress admin-post.php

Method
  POST

Authentication
  Public form nonce, honeypot, rate limit, duplicate guard, reCAPTCHA when configured.

Relevant implementation
  wp-content/plugins/megabin-onboarding/includes/Signup_Form.php
  wp-content/plugins/megabin-onboarding/includes/Form_Guard.php
  wp-content/plugins/megabin-onboarding/includes/Recaptcha.php
```

Request schema:

- `action` set to `megabin_submit_signup`.
- `_wpnonce`.
- `mbon[...]` fields documented as recurring signup input fields in `MEGABIN_DATA_MODEL.md`.
- Optional `g-recaptcha-response` if reCAPTCHA is configured.

Response schema:

- Browser redirect/reload to success URL or form URL with error state.
- No JSON contract.

Success behaviour:

- Save local signup.
- Send office/customer emails.
- Queue Google Sheets sync.
- Redirect to confirmation/success state.

Failure behaviour:

- Show form error.
- Preserve submitted values where possible.
- Do not sync externally if local validation/save fails.

Retry behaviour:

- User can correct and resubmit.
- Duplicate completed submissions redirect to the existing success state.

## Contract: Public Once-Off Request Form

```text
Source
  Public website visitor browser

Destination
  WordPress admin-post handler

Trigger
  Submit once-off request form.

Endpoint
  WordPress admin-post.php

Method
  POST multipart/form-data

Authentication
  Public form nonce, honeypot, rate limit, duplicate guard, reCAPTCHA when configured.

Relevant implementation
  wp-content/plugins/megabin-onboarding/includes/Once_Off_Form.php
  wp-content/plugins/megabin-onboarding/includes/Form_Guard.php
  wp-content/plugins/megabin-onboarding/includes/Recaptcha.php
```

Request schema:

- `action` set to `megabin_submit_once_off_request`.
- `_wpnonce`.
- `mbon[...]` fields documented as once-off input fields in `MEGABIN_DATA_MODEL.md`.
- Optional uploaded photos.
- Optional `g-recaptcha-response` if reCAPTCHA is configured.

Response schema:

- Browser redirect/reload to success URL or form URL with error state.
- No JSON contract.

Success behaviour:

- Validate uploads.
- Store photo metadata/files in protected upload folder.
- Save local once-off request.
- Send office/customer emails.
- Queue Google Sheets sync.
- Redirect to success state.

Failure behaviour:

- Show form error.
- Preserve submitted values where possible.
- Clean up uploaded photos if local save fails.

Retry behaviour:

- User can correct and resubmit.
- Duplicate completed submissions redirect to existing success state.

## Contract: WordPress -> Google reCAPTCHA Verify

```text
Source
  MegaBin WordPress plugin

Destination
  Google reCAPTCHA verification service

Trigger
  Public form submission when reCAPTCHA is enabled and configured.

Endpoint
  Google reCAPTCHA verify endpoint.

Method
  POST

Authentication
  reCAPTCHA secret key from WordPress settings.

Relevant implementation
  wp-content/plugins/megabin-onboarding/includes/Recaptcha.php
```

Request data:

- Secret key.
- Browser response token.
- Remote IP.

Expected response:

- JSON success flag from Google.

Failure behaviour:

- Form submission is rejected with a customer-facing validation error.

## Contract: WordPress -> Email Transport

```text
Source
  MegaBin WordPress plugin

Destination
  WordPress mail transport / SMTP / hosting mail

Trigger
  Local save, admin acknowledgement, or repeated sync failure.

Endpoint
  wp_mail abstraction.

Method
  WordPress internal function call.

Authentication
  Mail credentials are configured outside this code, usually through hosting or SMTP plugin/settings.

Relevant implementation
  wp-content/plugins/megabin-onboarding/includes/Notifications.php
```

Payload:

- Plain-text email bodies generated from saved rows.

Response:

- Boolean from `wp_mail`.
- Errors captured through `wp_mail_failed` when available.

Failure behaviour:

- Error status and message stored on the local record where supported.

## Contract: Browser -> Tracking Platforms

```text
Source
  Visitor browser

Destination
  GA4, Google Tag Manager, Meta Pixel, TikTok Pixel

Trigger
  Page load after consent where required, CTA/contact events, conversion success pages.

Endpoint
  Platform scripts loaded using IDs from WordPress settings.

Method
  Browser script/network calls.

Authentication
  Public tracking IDs in WordPress settings.

Relevant implementation
  wp-content/plugins/megabin-onboarding/includes/Tracking.php
  wp-content/plugins/megabin-onboarding/assets/js/tracking-consent.js
  wp-content/plugins/megabin-onboarding/assets/js/tracking-events.js
```

Success/failure:

- No server-side retry. Browser-side tracking depends on consent, script loading, and user privacy settings.

## Future Website <-> Control Centre Interface

Do not treat this section as a final API design. It identifies likely future integration points based on current website behaviour.

### Likely Future Flow: Weekly Signup

```text
Website weekly signup
  -> Control Centre API
  -> Supabase / internal processing
  -> Control Centre office workflow
  -> optional website confirmation/status response
```

Current operation to replace or support:

- Local WordPress signup insert.
- Office notification.
- Google Sheets sync.
- Office acknowledgement/welcome email.

### Likely Future Flow: Once-Off Request

```text
Website once-off request
  -> Control Centre API
  -> Supabase / quote workflow
  -> office quote/invoice process
```

Current operation to replace or support:

- Local WordPress once-off insert.
- Protected photo storage.
- Office notification.
- Google Sheets sync.

### Likely Future Flow: Service-Area Lookup

```text
Website suburb checker
  -> Control Centre service-area endpoint
  -> approved/manual-review response
```

Current operation to replace or support:

- GeoJSON file-based approved suburb matching.

### Likely Future Flow: Price/Reference Data

```text
Control Centre/Supabase
  -> website read-only settings/reference API
  -> prices, service rules, suburb source, contact details where centralised
```

Current operation to replace or support:

- WordPress plugin settings as source of truth for price/contact/legal versions.

### Likely Future Flow: Marketing Attribution

```text
Website captures attribution
  -> Control Centre lead/customer record
  -> reporting/analytics
```

Current operation to preserve:

- UTM/referrer capture.

## Open API Decisions

- Will WordPress continue saving locally first after a Control Centre API exists?
- Will the Control Centre provide synchronous acceptance or queue submissions asynchronously?
- How will WordPress authenticate to the Control Centre?
- How will duplicate submissions be detected across systems?
- Where will photos and agreement PDFs be stored long term?
- Will Google Sheets remain as an export sink?
- Will Supabase Auth be staff-only, customer-facing, or both?
- Which lifecycle states become canonical in the Control Centre?
