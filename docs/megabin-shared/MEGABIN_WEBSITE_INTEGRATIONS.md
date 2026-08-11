# MegaBin Website Integrations

> **Document status: legacy/source context.** This file describes integrations in the separate website system and is not the authoritative Control Centre integration architecture.

This document lists integrations currently used by the MegaBin Website. Secrets and private endpoint values are intentionally not included.

## WordPress Custom Plugin

What it does:

- Owns onboarding, once-off requests, settings, legal content, protected uploads, notifications, sync queue, tracking output, reCAPTCHA, and launch utilities.

Implemented in:

- `wp-content/plugins/megabin-onboarding/megabin-onboarding.php`
- `wp-content/plugins/megabin-onboarding/includes/Plugin.php`

Direction:

- WordPress page/request -> plugin forms/admin -> local DB/settings/files -> email/Sheets/tracking output.

Trigger:

- WordPress `plugins_loaded` boot.
- Shortcode rendering.
- `admin_post` form submissions and admin actions.
- WordPress cron for sync queue.

Authentication:

- WordPress capabilities/nonces for admin actions.
- Public form nonce, honeypot, rate limiting, duplicate guard, and reCAPTCHA where configured.

Expected to remain:

- Yes, as the website integration layer. It may later call the Control Centre instead of, or in addition to, Google Sheets.

## WordPress Forms

### Weekly Signup Form

Implemented in:

- `wp-content/plugins/megabin-onboarding/includes/Signup_Form.php`

Rendered by:

- `[megabin_signup_form]`

Trigger:

- Public POST to WordPress `admin-post.php` action `megabin_submit_signup`, handled through `admin_post_nopriv_megabin_submit_signup` and `admin_post_megabin_submit_signup`.

Data flow:

```text
Visitor -> WordPress form -> plugin validation -> local signup table -> email notifications -> sync queue -> Google Sheets webhook
```

Expected response:

- Redirect or reload to a success/confirmation state.
- On validation errors, preserve entered form data where possible.

Error handling:

- Validation errors redirect back to the form with stored transient state.
- Save failure shows a customer-facing error.
- External sync failure does not block customer success if local save succeeds.

Expected to remain:

- Yes, as the public website signup interface. Future destination may become the Control Centre API.

### Once-Off Request Form

Implemented in:

- `wp-content/plugins/megabin-onboarding/includes/Once_Off_Form.php`

Rendered by:

- `[megabin_once_off_request_form]`

Trigger:

- Public POST to WordPress `admin-post.php` action `megabin_submit_once_off_request`, handled through `admin_post_nopriv_megabin_submit_once_off_request` and `admin_post_megabin_submit_once_off_request`.

Data flow:

```text
Visitor -> WordPress form/photo upload -> plugin validation -> protected upload storage -> local once-off table -> email notifications -> sync queue -> Google Sheets webhook
```

Expected response:

- Redirect or reload to a success state.

Error handling:

- Validation errors preserve entered form data where possible.
- Invalid upload type/size/count is rejected.
- Uploaded photos are cleaned up if local save fails.
- External sync failure does not block customer success if local save succeeds.

Expected to remain:

- Yes, as the public website once-off request interface. Future destination may become the Control Centre API.

## Google Sheets Sync

What it does:

- Sends saved signup and once-off request records to Google Sheets tabs for office visibility.

Implemented in:

- `wp-content/plugins/megabin-onboarding/includes/Sheet_Sync.php`
- `wp-content/plugins/megabin-onboarding/includes/Sync_Queue_Repository.php`
- `scripts/google-apps-script/megabin-onboarding-webhook.gs`

Direction:

- WordPress -> Google Apps Script -> Google Sheets.

Trigger:

- Queue created immediately after successful local save.
- Queue processed by WP-Cron every 15 minutes.
- Admin can manually process pending queue items.

Payload:

- JSON body with `spreadsheet_id`, `target_tab`, `record_type`, `record_id`, `reference`, and column-label keyed `payload`.
- Secret is included only when configured in WordPress settings.

Expected response:

- JSON body with success flag from Apps Script.
- HTTP 2xx required.

Retry/queue behavior:

- Queue rows can be `queued`, `failed`, or `synced`.
- Failed and queued rows are eligible for retry.
- Attempt count and last error are stored.
- After repeated failures, the plugin sends sync-failure alerts to office recipients.

Authentication approach:

- Shared webhook secret configured in WordPress settings and Google Apps Script properties.
- The PHP side sends the secret in the JSON body and several headers for compatibility.
- The Apps Script currently checks the JSON `secret` value against its script property.

Dependencies:

- WordPress HTTP API.
- Outbound HTTPS from hosting.
- Google Apps Script deployed as web app.
- Google Sheet with expected tabs/headers.

Temporary or permanent:

- Likely temporary/intermediary once the Control Centre exists. It may remain as an export/reporting integration, but should not be the long-term operational backend if the Control Centre owns workflow state.

## Google Apps Script Webhook

What it does:

- Receives WordPress sync payloads and inserts/updates rows in the configured Google Sheet.

Implemented in:

- `scripts/google-apps-script/megabin-onboarding-webhook.gs`

Direction:

- Receives HTTP POST from WordPress.
- Writes to Google Sheets.
- Writes errors to `Sync Errors`.

Trigger:

- Web app `doPost`.
- Web app `doGet` provides a basic health response.

Payload:

- `spreadsheet_id`
- `target_tab`
- `record_type`
- `record_id`
- `reference`
- `payload`
- `secret`

Expected response:

- JSON object with `ok: true` on success.
- JSON object with `ok: false` and an error string on failure.

Error handling:

- Rejects unauthorized requests.
- Rejects unknown tabs.
- Ensures tabs/headers.
- Updates an existing row when the reference already exists.
- Appends a row when the reference is new.
- Sanitizes spreadsheet cell values that could become formulas.
- Logs sync errors to `Sync Errors` where possible.

Authentication approach:

- Apps Script property `MEGABIN_WEBHOOK_SECRET`.
- Optional spreadsheet property `MEGABIN_SPREADSHEET_ID`.

Do not document:

- Actual web app URL.
- Actual spreadsheet ID.
- Actual secret.

## Google reCAPTCHA

What it does:

- Adds anti-spam validation to public forms.

Implemented in:

- `wp-content/plugins/megabin-onboarding/includes/Recaptcha.php`

Direction:

- Browser loads Google reCAPTCHA script if site key is configured.
- Server verifies token through Google's reCAPTCHA verification endpoint.

Trigger:

- Form render and form submission.

Expected response:

- Google verification response with success flag.

Error handling:

- Missing token, HTTP failure, or invalid response returns validation errors.
- If keys are not configured, reCAPTCHA is not enforced.

Authentication:

- Site key and secret key from WordPress settings.

Expected to remain:

- Yes for public website forms unless replaced by another spam protection system.

## WordPress Email

What it does:

- Sends office notifications, customer confirmations, welcome/debit-order emails after office acknowledgement, and sync-failure alerts.

Implemented in:

- `wp-content/plugins/megabin-onboarding/includes/Notifications.php`

Direction:

- WordPress -> configured mail transport -> recipients.

Trigger:

- Successful local save.
- Admin office acknowledgement.
- Repeated sync failures.

Payload:

- Plain-text email content generated from saved rows.
- Office signup emails include customer and submission details.
- Customer emails include confirmation and next steps.
- Welcome emails may include the configured debit-order link.

Error handling:

- Uses `wp_mail`.
- Captures `wp_mail_failed` where possible.
- Stores sent/error status and timestamps on local records.

Dependencies:

- Reliable WordPress mail configuration.
- SMTP or transactional mail is recommended for production.

Expected to remain:

- Yes. The Control Centre may later own some operational emails, but public submission confirmations may remain website-owned.

## Debit-Order Mandate Provider

What it does:

- External website where customers can complete debit-order mandate setup after office confirmation.

Implemented in:

- URL stored in MegaBin plugin settings.
- Used by `Notifications::send_recurring_welcome_email`.
- Legacy direct redirect support exists in `Signup_Form.php` but current setting should keep post-signup action as confirmation page.

Direction:

- Website/email -> external mandate page.

Trigger:

- Office acknowledgement/welcome email, not immediate customer signup redirect.

Payload:

- No signup reference is appended at launch.
- No banking details are stored in WordPress.

Authentication:

- External provider's own process. Website only stores the configured URL.

Expected to remain:

- May remain until the Control Centre or provider integration changes the debit-order workflow.

## Marketing And Tracking Platforms

What it does:

- Outputs consent-aware tracking snippets and conversion events for GA4, Google Tag Manager, Meta Pixel, and TikTok Pixel.

Implemented in:

- `wp-content/plugins/megabin-onboarding/includes/Tracking.php`
- `wp-content/plugins/megabin-onboarding/assets/js/tracking-consent.js`
- `wp-content/plugins/megabin-onboarding/assets/js/tracking-events.js`

Direction:

- Browser -> tracking platforms.

Trigger:

- Page load after consent where required.
- Conversion query parameters after successful recurring or once-off submissions.
- Front-end click/event listeners.

Payload:

- Page views and lead/conversion events.
- Does not require raw customer identifiers for the current website events.

Authentication:

- Tracking IDs stored in WordPress settings.

Expected to remain:

- Yes for public website marketing. The Control Centre may eventually have separate analytics for internal operations.

## Service-Area GeoJSON

What it does:

- Provides the approved suburb source for website suburb matching and service-area search.

Implemented in:

- `wp-content/plugins/megabin-onboarding/includes/Geofence.php`
- `wp-content/plugins/megabin-onboarding/data/service-areas/megabin-pretoria-radius-geofence.geojson`
- `wp-content/plugins/megabin-onboarding/assets/js/service-area-search.js`

Direction:

- Local file -> server-side and front-end service area output.

Trigger:

- Signup submission.
- Service-area checker shortcode render and browser search.

Expected response:

- Approved/service available or not-yet-approved/manual-review messaging.

Expected to remain:

- Yes for launch. Future Control Centre may become the service-area source of truth and publish a read-only list/API to the website.

## Launch Redirects

What it does:

- Redirects known legacy URLs to current pages when enabled.
- Always redirects `/sign-up` to the weekly signup form anchor.

Implemented in:

- `wp-content/plugins/megabin-onboarding/includes/Launch_Redirects.php`

Trigger:

- WordPress `template_redirect`.

Authentication:

- Public redirects. Admin page requires WordPress capability.

Expected to remain:

- Yes as website SEO/launch hygiene, but redirect map should be carefully approved.

## Cache-Control Guard

What it does:

- Sends no-cache headers for pages with dynamic forms or confirmation shortcodes.

Implemented in:

- `wp-content/plugins/megabin-onboarding/includes/Cache_Control.php`

Trigger:

- WordPress `template_redirect`.

Expected to remain:

- Yes. Host-level full-page cache exclusions are still required.

## Local Preview And Geofence Tooling

What it does:

- Supports local preview/rendering and service-area development.

Implemented in:

- `app.js`
- `dev-server.mjs`
- `index.html`
- `styles.css`
- `package.json`
- `dist/`

External services referenced:

- OpenStreetMap/Nominatim/Photon-style geocoding endpoints in local tooling.

Expected to remain:

- Development-only. Do not carry this into the future Control Centre unless a deliberate map/geofence editor is built there.
