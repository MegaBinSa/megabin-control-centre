# MegaBin Website Business Rules

> **Document status: legacy/source context.** These rules document current website behaviour and require ownership and migration review before becoming Control Centre rules.

This document extracts rules currently enforced or assumed by the website/plugin. It only includes rules supported by repository evidence or existing approved project documentation.

## Architecture Rules

### Critical logic belongs in the plugin

Rule:

- Signup, pricing, geofence, legal, PDF, Google Sheets, reCAPTCHA, notification, and tracking logic must not be placed in Elementor templates.

Evidence:

- `docs/PROJECT_CONTEXT.md`
- `wp-content/plugins/megabin-onboarding/includes/Plugin.php`
- `wp-content/plugins/megabin-onboarding/includes/Launch_Pages.php`

### Website is not the future operations platform

Rule:

- WordPress should remain the public website and onboarding layer.
- Deeper operational workflows should move to the future Control Centre through a deliberate integration boundary.

Evidence:

- Current implementation only stores submissions, email statuses, sync statuses, and limited admin acknowledgement.
- No route assignment, active-client operations, billing ledger, or customer portal is implemented.

## Weekly Signup Rules

### Local save first

Rule:

- A weekly signup must be saved locally before external sync or customer follow-up.

Evidence:

- `Signup_Form.php`
- `Submission_Repository.php`
- `Sheet_Sync.php`

### Starting status

Rule:

- A submitted weekly signup starts as `debit_order_pending`.

Evidence:

- `Signup_Form.php`

### Customer type

Rule:

- Customer type must be either `individual` or `organisation`.
- Individual signups require full name and South African ID number.
- Organisation signups require organisation name, company registration number, and contact person.

Evidence:

- `Signup_Form.php`

### Required weekly fields

Rule:

- Required fields include service address line 1, suburb, city, customer type, contact details, property type, drum quantity, billing date, signatory name, signatory identifier, authority confirmation, SLA acceptance, and privacy acknowledgement.

Evidence:

- `Signup_Form.php`

### Drum quantity

Rule:

- Drum quantity must be at least 1.
- There is no online maximum in the current form logic.

Evidence:

- `Signup_Form.php`

### Pricing calculation

Rule:

- Monthly amount is `number_of_drums * current price_per_drum`.
- Price is read from plugin settings at submission time.

Evidence:

- `Signup_Form.php`
- `Settings.php`
- `Marketing_Content.php`

### Billing dates

Rule:

- Allowed billing dates are 15, 20, 25, and 30.

Evidence:

- `Signup_Form.php`

### Pro-rata handling

Rule:

- The website flags whether pro-rata is required, but does not calculate or display a pro-rata amount.

Evidence:

- `Signup_Form.php`
- `Sheet_Sync.php` maps `Pro-Rata Amount` as blank.

### Debit-order handling

Rule:

- Customers are not redirected directly to the debit-order mandate after signup under the current launch decision.
- Debit-order setup happens after office review/confirmation through the welcome email or office help by phone.
- The external mandate URL is settings-controlled.
- Signup references are not appended to the mandate URL at launch.

Evidence:

- `Settings.php`
- `Signup_Form.php`
- `Notifications.php`
- `Launch_Pages.php`

### Weekly service activation

Rule:

- A form submission does not mean the service is active.
- Office review/acknowledgement is required before service activation.

Evidence:

- `Signup_Form.php`
- `Submission_Repository.php`
- `Notifications.php`
- `Launch_Pages.php`

## Once-Off Request Rules

### Local save first

Rule:

- A once-off request must be saved locally before external sync.

Evidence:

- `Once_Off_Form.php`
- `Once_Off_Repository.php`
- `Sheet_Sync.php`

### Starting status

Rule:

- A once-off request starts as `quote_pending`.

Evidence:

- `Once_Off_Form.php`

### Required once-off fields

Rule:

- Required fields include name, mobile number, email address, address line 1, suburb, city, description, estimated loads, garden-refuse-only confirmation, once-off terms acceptance, and privacy acknowledgement.

Evidence:

- `Once_Off_Form.php`

### Estimated loads

Rule:

- Estimated loads must be an integer of at least 1.

Evidence:

- `Once_Off_Form.php`

### Photo uploads

Rule:

- Photos are optional.
- Maximum 3 photos.
- Maximum 2 MB per photo.
- Allowed file types are JPG, PNG, and WEBP.
- Uploaded photos are stored in protected plugin-managed uploads.

Evidence:

- `Once_Off_Form.php`
- `Protected_Storage.php`

### Once-off payment

Rule:

- The website captures a quote request only.
- Payment is handled by EFT after invoice.
- Quote/payment/schedule values are not populated by the website on initial submission.

Evidence:

- `Once_Off_Form.php`
- `Sheet_Sync.php`
- `Launch_Pages.php`

## Service-Area Rules

### Approved suburb matching

Rule:

- The website checks the submitted suburb against the configured GeoJSON accepted suburb list.

Evidence:

- `Geofence.php`
- `data/service-areas/megabin-pretoria-radius-geofence.geojson`
- `wp-content/plugins/megabin-onboarding/data/service-areas/megabin-pretoria-radius-geofence.geojson`

### Unsupported/non-listed suburbs

Rule:

- Non-listed suburbs do not block submission.
- They are saved with manual review required.

Evidence:

- `Geofence.php`
- `Signup_Form.php`

### Routes and collection days

Rule:

- The website does not publish fixed route or collection-day data.

Evidence:

- Approved project decisions in `docs/PROJECT_CONTEXT.md`.
- No route/day assignment code exists beyond blank Sheet columns.

## Legal And Consent Rules

### Legal versions

Rule:

- Weekly signup records store SLA, Terms, and Privacy versions from settings.
- Once-off request records store Once-Off Terms and Privacy versions from settings.

Evidence:

- `Settings.php`
- `Signup_Form.php`
- `Once_Off_Form.php`
- `Legal_Documents.php`

### Acceptance requirements

Rule:

- Weekly signup requires SLA acceptance, privacy acknowledgement, typed signatory name, typed identifier, and authority confirmation.
- Once-off request requires once-off terms acceptance, garden-refuse-only confirmation, and privacy acknowledgement.
- Marketing consent is optional and unticked by default.

Evidence:

- `Signup_Form.php`
- `Once_Off_Form.php`

### Agreement PDF

Rule:

- Agreement PDF support exists, but the current launch decision avoids generating/sending the PDF automatically at customer submission time.
- PDF generation is admin/manual/deferred rather than customer-facing at submit.

Evidence:

- `Agreement_Pdf.php`
- `Signup_Form.php`
- `Notifications.php`

## Communication Rules

### Office notifications

Rule:

- Office lead notifications go to recipients configured in settings.
- Current default recipient is `leads@megabin.co.za`.
- Recurring office notification subjects include the customer name and reference.

Evidence:

- `Settings.php`
- `Notifications.php`

### Customer confirmations

Rule:

- Customer confirmation emails are sent after successful local save where email succeeds.
- Customer confirmation does not claim activation.

Evidence:

- `Notifications.php`

### Welcome/debit-order email

Rule:

- Welcome email is office-controlled after acknowledgement.
- It may include the configured debit-order URL if valid.

Evidence:

- `Admin.php`
- `Submission_Repository.php`
- `Notifications.php`

### Sync failure alerts

Rule:

- Sync failures do not cause customer submission failure if local save succeeded.
- Repeated sync failure triggers an office alert.

Evidence:

- `Sheet_Sync.php`
- `Notifications.php`

## Spam, Security, And Duplicate Rules

### Nonce validation

Rule:

- Public form submissions require valid WordPress nonces.

Evidence:

- `Signup_Form.php`
- `Once_Off_Form.php`

### reCAPTCHA

Rule:

- reCAPTCHA is settings-controlled.
- When enabled and configured with keys, public forms must pass Google verification.
- If keys are missing, verification is not enforced.

Evidence:

- `Recaptcha.php`

### Honeypot, rate limit, duplicate protection

Rule:

- Honeypot field must remain empty.
- Public forms are rate limited by form/context and request fingerprint.
- Duplicate submissions inside the duplicate window redirect to the existing success state after a completed submission.

Evidence:

- `Form_Guard.php`
- `Signup_Form.php`
- `Once_Off_Form.php`

## Google Sheets Rules

### Sync adapter

Rule:

- Google Sheets sync only runs when mode is `apps_script_webhook` and a webhook URL is configured.

Evidence:

- `Settings.php`
- `Sheet_Sync.php`

### Queue retries

Rule:

- Sync queue stores attempts, response code, last error, and completed timestamp.
- Queued/failed items can be processed by cron or admin action.

Evidence:

- `Sync_Queue_Repository.php`
- `Sheet_Sync.php`

### Formula injection protection

Rule:

- Apps Script prefixes cell values that begin with formula-like characters before writing to Sheets.

Evidence:

- `scripts/google-apps-script/megabin-onboarding-webhook.gs`

## Pricing And Editable Settings Rules

Rule:

- Frequently changed business values such as prices, contact numbers, tracking IDs, reCAPTCHA keys, social URLs, legal versions, debit-order URL, and Google Sheets settings belong in WordPress settings.

Evidence:

- `Settings.php`
- `Admin.php`
- `Marketing_Content.php`

## Cache Rules

Rule:

- Pages containing critical form/confirmation shortcodes should send no-cache headers.
- Host-level full-page cache exclusions are still required.

Evidence:

- `Cache_Control.php`

## Redirect Rules

Rule:

- `/sign-up` redirects to `/weekly-drum-service/#weekly-signup-form`.
- Other launch redirects are settings-controlled and disabled unless approved.

Evidence:

- `Launch_Redirects.php`

## Rules Not Currently Implemented

These may be important for the future Control Centre, but are not complete website responsibilities today:

- Active client lifecycle.
- Route assignment.
- Collection-day assignment.
- Staff task queues.
- Invoice and payment tracking.
- Debit-order mandate status tracking.
- Drum inventory/recovery.
- Customer portal authentication.
- Supabase database, auth, storage, or edge functions.
