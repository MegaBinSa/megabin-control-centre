# MegaBin Website Data Model

> **Document status: legacy/source context.** This is an inventory of website data, not the approved Control Centre database or domain model.

This document describes the data currently captured, stored, synced, or referenced by the MegaBin Website.

The website does not currently use a formal application data model outside WordPress. The logical model is derived from:

- `wp-content/plugins/megabin-onboarding/includes/Installer.php`
- `wp-content/plugins/megabin-onboarding/includes/Signup_Form.php`
- `wp-content/plugins/megabin-onboarding/includes/Once_Off_Form.php`
- `wp-content/plugins/megabin-onboarding/includes/Sheet_Sync.php`
- `scripts/google-apps-script/megabin-onboarding-webhook.gs`

## Entity Overview

### Verified Entities

- Recurring signup.
- Once-off collection request.
- Sync queue item.
- Service-area suburb.
- Protected once-off photo.
- Legal/agreement snapshot.
- Attribution fields.
- Plugin settings.

### Future Control Centre Candidates

The Control Centre should likely own or mirror:

- Customers.
- Service addresses.
- Service subscriptions.
- Operational account status.
- Drum quantities and drum assets.
- Route/day assignment.
- Office review workflow.
- Debit-order status.
- Once-off quote/invoice/payment/collection status.

These are future architecture considerations, not implemented Control Centre schema.

## Recurring Signup Entity

Source: weekly signup form.

Local destination: `wp_megabin_signups` table, with actual table prefix determined by WordPress.

External destination: Google Sheets tab `Recurring Signups` when sync is enabled.

Current status on submit: `debit_order_pending`.

### Fields

| Field | Meaning | Type | Required | Source | Destination | Validation / Rules | Control Centre candidate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | Local numeric record ID | integer | generated | WordPress DB | Local only / Sheet `Record ID` | Auto increment | Maybe legacy import key |
| `signup_reference` | Customer-facing signup reference | string | generated | Plugin | Local, emails, Sheet | Unique | Yes |
| `agreement_reference` | Unique legal acceptance reference | string | generated | Plugin | Local, emails, Sheet | Unique | Yes |
| `created_at` | Submission timestamp | datetime | generated | Plugin | Local, emails, Sheet | Current WP time | Yes |
| `updated_at` | Last updated timestamp | datetime | generated | Plugin | Local, Sheet | Updated on insert/sync actions | Yes |
| `signup_status` | Website signup status | string | yes | Plugin | Local, admin, Sheet | Starts `debit_order_pending`; can become `office_acknowledged` through admin action | Yes |
| `sync_status` | External sync status | string | yes | Plugin | Local, admin, Sheet | Starts `not_synced`; may become `sync_queued`, `synced`, `sync_failed`, `sync_queue_failed` | Temporary/integration |
| `customer_type` | Individual or organisation | enum string | yes | Form | Local, Sheet | `individual` or `organisation` | Yes |
| `full_name` | Individual customer name | string | conditional | Form | Local, emails, Sheet | Required for individual | Yes |
| `organisation_name` | Organisation/business name | string | conditional | Form | Local, emails, Sheet | Required for organisation | Yes |
| `company_registration_number` | Organisation registration identifier | string | conditional | Form | Local, Sheet | Required for organisation | Yes |
| `south_african_id_number` | Individual SA ID number | string | conditional | Form | Local, Sheet | Required for individual | Sensitive; yes |
| `contact_person` | Organisation contact person | string | conditional | Form | Local, emails, Sheet | Required for organisation | Yes |
| `mobile_number` | Customer mobile number | string | yes | Form | Local, emails, Sheet | Required, sanitized text | Yes |
| `email_address` | Customer email | email string | yes | Form | Local, emails, Sheet | Required, valid email | Yes |
| `address_line_1` | Service street address | string | yes | Form | Local, emails, Sheet | Required | Yes |
| `address_line_2` | Address detail | string | no | Form | Local, emails, Sheet | Optional | Yes |
| `suburb` | Submitted suburb | string | yes | Form | Local, emails, Sheet | Required | Yes |
| `matched_suburb` | Matched approved suburb | string | generated | GeoJSON lookup | Local, emails | Blank when not matched | Yes |
| `city` | City | string | yes | Form | Local, emails, Sheet | Required; default page value is Pretoria | Yes |
| `postal_code` | Postal code | string | no | Form | Local, Sheet | Optional | Yes |
| `billing_address` | Billing address if different | text | no | Form | Local, emails | Optional | Yes |
| `latitude` | Address latitude | decimal | no | Not captured at launch | Local, Sheet | Currently null unless future logic supplies it | Yes |
| `longitude` | Address longitude | decimal | no | Not captured at launch | Local, Sheet | Currently null unless future logic supplies it | Yes |
| `service_area_result` | Service-area outcome | string | generated | GeoJSON lookup | Local, emails, Sheet | `service_available` or `manual_area_review` from current suburb matching | Yes |
| `manual_review_required` | Whether office must manually review area | boolean/int | generated | GeoJSON lookup | Local, emails, Sheet | True for non-listed suburbs | Yes |
| `property_type` | Property category | enum string | yes | Form | Local, emails, Sheet | Required select; used for reporting/review | Yes |
| `drum_placement` | Preferred/expected drum placement | enum string | no | Form | Local, emails, Sheet | Optional select | Yes |
| `access_notes` | Access notes | text | no | Form | Local, emails, Sheet | Optional | Yes |
| `security_instructions` | Gate/security instructions | text | no | Form | Local, emails, Sheet | Optional | Yes |
| `dangerous_animal_flag` | Animal safety flag | boolean/int | no | Form | Local, emails, Sheet | Checkbox | Yes |
| `stairs_elevation_notes` | Stairs/elevation issue notes | text | no | Form | Local, emails, Sheet | Optional | Yes |
| `narrow_access_concerns` | Narrow-access notes | text | no | Form | Local | Optional; not currently mapped to Sheets payload | Yes |
| `collection_team_notes` | Notes for collection team | text | no | Form | Local | Optional; not currently mapped to Sheets payload | Yes |
| `number_of_drums` | Requested drum quantity | integer | yes | Form | Local, emails, Sheet | Minimum 1; no online maximum | Yes |
| `price_per_drum` | Price used at submission | decimal | generated | Settings | Local, emails, Sheet | Current setting at submission time | Yes |
| `monthly_amount` | Monthly total | decimal | generated | Plugin | Local, emails, Sheet | `number_of_drums * price_per_drum` | Yes |
| `preferred_billing_day` | Debit-order day | integer | yes | Form | Local, emails, Sheet | Must be 15, 20, 25, or 30 | Yes |
| `pro_rata_required` | Manual pro-rata flag | boolean/int | generated | Plugin | Local, emails, Sheet | True if signup is more than seven days before month-end | Yes |
| `sla_version` | SLA version accepted | string | generated | Settings | Local, Sheet | Current setting | Yes |
| `terms_version` | Terms version accepted | string | generated | Settings | Local, Sheet | Current setting | Yes |
| `privacy_version` | Privacy version acknowledged | string | generated | Settings | Local, Sheet | Current setting | Yes |
| `sla_accepted_at` | Legal acceptance timestamp | datetime | generated | Plugin | Local, emails, Sheet | Required via acceptance checkbox | Yes |
| `signatory_name` | Typed signatory name | string | yes | Form | Local, Sheet | Required | Yes |
| `signatory_identifier_type` | ID or company registration type | string | generated | Customer type | Local | Derived from customer type | Yes |
| `signatory_identifier` | Signatory ID/registration number | string | yes | Form | Local, Sheet | Required | Sensitive; yes |
| `ip_address` | Submitter IP address | string | generated | Request | Local, Sheet | Captured from request | Security/audit |
| `user_agent` | Browser user agent | text | generated | Request | Local, Sheet | Captured from request | Security/audit |
| `marketing_consent` | Optional marketing consent | boolean/int | no | Form | Local, Sheet | Unticked by default | Yes |
| `utm_source` | Campaign source | string | no | Attribution JS/hidden fields | Local, Sheet | Max 190 chars | Analytics |
| `utm_medium` | Campaign medium | string | no | Attribution JS/hidden fields | Local, Sheet | Max 190 chars | Analytics |
| `utm_campaign` | Campaign name | string | no | Attribution JS/hidden fields | Local, Sheet | Max 190 chars | Analytics |
| `utm_content` | Campaign content | string | no | Attribution JS/hidden fields | Local, Sheet | Max 190 chars | Analytics |
| `referrer` | Referring URL/text | string/text | no | Attribution JS/hidden fields | Local, Sheet | URL or sanitized/truncated text | Analytics |
| `raw_payload` | Submitted payload plus legal snapshot | JSON text | generated | Plugin | Local | Encoded input; contains legal snapshot | Maybe archive/import only |
| `agreement_pdf_status` | PDF status | string | generated/admin | Local | Local/admin | Currently admin/manual/deferred; not customer-send on submit | Maybe document storage |
| `agreement_pdf_path` | Protected PDF path | string | generated/admin | Local | Local/admin | Protected storage | Maybe document storage |
| `agreement_pdf_hash` | PDF hash | string | generated/admin | Local, Sheet note | Local/admin/Sheet | SHA-256 when generated | Maybe document verification |
| `agreement_pdf_generated_at` | PDF generated timestamp | datetime | generated/admin | Local | Local/admin | Set when generated | Maybe document verification |
| `agreement_pdf_error` | PDF error details | text | generated/admin | Local | Local/admin | Stored on failure | Operational |
| `office_notification_status` | Office email status | string | generated | Notifications | Local | `pending`, `sent`, or `failed` style values | Operational |
| `office_notification_sent_at` | Office email sent timestamp | datetime | generated | Notifications | Local | Set on success | Operational |
| `office_notification_error` | Office email error | text | generated | Notifications | Local | Captured from `wp_mail_failed` where available | Operational |
| `customer_confirmation_status` | Customer email status | string | generated | Notifications | Local | `pending`, `sent`, or `failed` style values | Operational |
| `customer_confirmation_sent_at` | Customer email sent timestamp | datetime | generated | Notifications | Local | Set on success | Operational |
| `customer_confirmation_error` | Customer email error | text | generated | Notifications | Local | Captured from `wp_mail_failed` where available | Operational |
| `office_acknowledged` | Office review acknowledgement flag | boolean/int | admin | Local, Sheet | Set by admin action | Yes |
| `office_acknowledged_at` | Acknowledgement timestamp | datetime | admin | Local, Sheet | Set by admin action | Yes |
| `welcome_email_status` | Office-controlled welcome email status | string | admin/generated | Local, Sheet | Pending/sent/failed | Yes |
| `welcome_email_sent_at` | Welcome email sent timestamp | datetime | admin/generated | Local, Sheet | Set on success | Yes |
| `welcome_email_error` | Welcome email error | text | admin/generated | Local | Captured failure details | Operational |

### Recurring Signup Sheet Fields

The current Google Sheets payload maps recurring records to these column labels:

`Record ID`, `Signup Reference`, `Created At`, `Updated At`, `Signup Status`, `Sync Status`, `Customer Type`, `Full Name`, `Organisation Name`, `Company Registration Number`, `South African ID Number`, `Contact Person`, `Mobile Number`, `Email Address`, `Address Line 1`, `Address Line 2`, `Suburb`, `City`, `Postal Code`, `Latitude`, `Longitude`, `Service Area Result`, `Manual Review Required`, `Property Type`, `Drum Placement`, `Access Notes`, `Security Instructions`, `Dangerous Animal Flag`, `Stairs / Elevation Notes`, `Number of Drums`, `Price per Drum`, `Monthly Amount`, `Preferred Billing Day`, `Pro-Rata Required`, `Pro-Rata Amount`, `Service Start Date`, `SLA Version`, `Terms Version`, `Privacy Version`, `Agreement Reference`, `SLA Accepted At`, `Signatory Name`, `Signatory Identifier Type`, `Signatory Identifier`, `IP Address`, `User Agent`, `SLA PDF URL`, `Debit Order Status`, `Debit Order Redirected At`, `Office Acknowledged`, `Office Acknowledged At`, `Welcome Email Sent`, `Welcome Email Sent At`, `Delivery Status`, `Delivery Date`, `Route Team`, `Collection Day`, `UTM Source`, `UTM Medium`, `UTM Campaign`, `UTM Content`, `Referrer`, `Notes`.

Some Sheet columns are placeholders for future office/operations workflow and are not actively populated by the website.

## Once-Off Request Entity

Source: once-off collection request form.

Local destination: `wp_megabin_once_off_requests` table.

External destination: Google Sheets tab `Once-Off Requests` when sync is enabled.

Current status on submit: `quote_pending`.

### Fields

| Field | Meaning | Type | Required | Source | Destination | Validation / Rules | Control Centre candidate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | Local numeric record ID | integer | generated | WordPress DB | Local / Sheet `Record ID` | Auto increment | Maybe legacy import key |
| `request_reference` | Customer-facing once-off reference | string | generated | Plugin | Local, emails, Sheet | Unique | Yes |
| `created_at` | Submission timestamp | datetime | generated | Plugin | Local, emails, Sheet | Current WP time | Yes |
| `updated_at` | Last updated timestamp | datetime | generated | Plugin | Local, Sheet | Updated on insert/sync actions | Yes |
| `request_status` | Once-off workflow status | string | yes | Plugin | Local, admin, Sheet | Starts `quote_pending` | Yes |
| `sync_status` | External sync status | string | yes | Plugin | Local, admin, Sheet | Starts `not_synced`; may become queued/synced/failed | Temporary/integration |
| `name` | Customer name | string | yes | Form | Local, emails, Sheet | Required | Yes |
| `mobile_number` | Customer mobile number | string | yes | Form | Local, emails, Sheet | Required | Yes |
| `email_address` | Customer email | email string | yes | Form | Local, emails, Sheet | Required, valid email | Yes |
| `address_line_1` | Collection street address | string | yes | Form | Local, emails, Sheet | Required | Yes |
| `address_line_2` | Address detail | string | no | Form | Local, emails, Sheet | Optional | Yes |
| `suburb` | Collection suburb | string | yes | Form | Local, emails, Sheet | Required | Yes |
| `city` | City | string | yes | Form | Local, emails, Sheet | Required | Yes |
| `postal_code` | Postal code | string | no | Form | Local, Sheet | Optional | Yes |
| `latitude` | Address latitude | decimal | no | Not captured at launch | Local, Sheet | Currently null unless future logic supplies it | Yes |
| `longitude` | Address longitude | decimal | no | Not captured at launch | Local, Sheet | Currently null unless future logic supplies it | Yes |
| `description` | Description of garden refuse load | text | yes | Form | Local, emails, Sheet | Required | Yes |
| `estimated_loads` | Customer's estimated number of trailer loads | integer | yes | Form | Local, emails, Sheet | Minimum 1 | Yes |
| `advertised_price_per_load` | Current once-off advertised price | decimal | generated | Settings | Local, emails, Sheet | Current setting at submission | Yes |
| `preferred_collection_date` | Desired collection date | date string | no | Form | Local, emails, Sheet | Optional `YYYY-MM-DD` | Yes |
| `access_notes` | Access notes | text | no | Form | Local, emails, Sheet | Optional | Yes |
| `garden_refuse_only_confirmed` | Customer confirms garden-refuse-only scope | boolean/int | yes | Form | Local, Sheet | Required checkbox | Yes |
| `once_off_terms_version` | Once-off terms version accepted | string | generated | Settings | Local, Sheet | Current setting | Yes |
| `privacy_version` | Privacy version acknowledged | string | generated | Settings | Local, Sheet | Current setting | Yes |
| `terms_accepted_at` | Terms acceptance timestamp | datetime | generated | Plugin | Local, Sheet | Required via checkbox | Yes |
| `marketing_consent` | Optional marketing consent | boolean/int | no | Form | Local, Sheet | Unticked by default | Yes |
| `photo_files` | Protected upload metadata | JSON text | no | Form uploads | Local, Sheet labels | Max 3 photos, 2 MB each, JPG/PNG/WEBP | Yes/document storage |
| `office_notification_status` | Office email status | string | generated | Notifications | Local | Pending/sent/failed style values | Operational |
| `office_notification_sent_at` | Office email sent timestamp | datetime | generated | Notifications | Local | Set on success | Operational |
| `office_notification_error` | Office email error | text | generated | Notifications | Local | Captured from `wp_mail_failed` where available | Operational |
| `customer_confirmation_status` | Customer email status | string | generated | Notifications | Local | Pending/sent/failed style values | Operational |
| `customer_confirmation_sent_at` | Customer email sent timestamp | datetime | generated | Notifications | Local | Set on success | Operational |
| `customer_confirmation_error` | Customer email error | text | generated | Notifications | Local | Captured from `wp_mail_failed` where available | Operational |
| `ip_address` | Submitter IP address | string | generated | Request | Local | Captured from request | Security/audit |
| `user_agent` | Browser user agent | text | generated | Request | Local | Captured from request | Security/audit |
| `raw_payload` | Submitted once-off payload | JSON text | generated | Plugin | Local | Encoded sanitized input | Maybe archive/import only |
| `utm_source` | Campaign source | string | no | Attribution JS/hidden fields | Local, Sheet | Max 190 chars | Analytics |
| `utm_medium` | Campaign medium | string | no | Attribution JS/hidden fields | Local, Sheet | Max 190 chars | Analytics |
| `utm_campaign` | Campaign name | string | no | Attribution JS/hidden fields | Local, Sheet | Max 190 chars | Analytics |
| `utm_content` | Campaign content | string | no | Attribution JS/hidden fields | Local, Sheet | Max 190 chars | Analytics |
| `referrer` | Referring URL/text | string/text | no | Attribution JS/hidden fields | Local, Sheet | URL or sanitized/truncated text | Analytics |

### Once-Off Sheet Fields

The current Google Sheets payload maps once-off records to these column labels:

`Record ID`, `Request Reference`, `Created At`, `Updated At`, `Request Status`, `Sync Status`, `Name`, `Mobile Number`, `Email Address`, `Address Line 1`, `Address Line 2`, `Suburb`, `City`, `Postal Code`, `Latitude`, `Longitude`, `Description`, `Estimated Loads`, `Advertised Price Per Full Load`, `Preferred Collection Date`, `Access Notes`, `Garden Refuse Only Confirmed`, `Once-Off Terms Version`, `Privacy Version`, `Terms Accepted At`, `Marketing Consent`, `Photo URL 1`, `Photo URL 2`, `Photo URL 3`, `Office Quote Notes`, `Quoted Loads`, `Quoted Amount`, `Invoice Status`, `Payment Status`, `Scheduled Collection Date`, `UTM Source`, `UTM Medium`, `UTM Campaign`, `UTM Content`, `Referrer`, `Notes`.

Several quote/payment/scheduling columns are placeholders for office workflow and are not populated by the website on submission.

## Sync Queue Entity

Local destination: `wp_megabin_sync_queue` table.

Purpose: decouple customer submission from Google Sheets availability.

| Field | Meaning | Type | Required | Source | Rules |
| --- | --- | --- | --- | --- | --- |
| `id` | Queue record ID | integer | generated | WordPress DB | Auto increment |
| `created_at` | Queue created timestamp | datetime | generated | Plugin | Current WP time |
| `updated_at` | Last queue update timestamp | datetime | generated | Plugin | Updated on retry/sync |
| `source_type` | Record type | string | yes | Plugin | `recurring_signup` or `once_off_request` currently |
| `source_id` | Local record ID | integer | yes | Plugin | References local signup/request ID |
| `reference` | Public reference | string | yes | Plugin | Signup/request reference |
| `target_tab` | Google Sheet tab name | string | yes | Plugin | `Recurring Signups` or `Once-Off Requests` currently |
| `payload` | Sheet payload | JSON text | yes | Plugin | Column-label keyed object |
| `queue_status` | Queue state | string | yes | Plugin | `queued`, `failed`, `synced` |
| `adapter` | Sync adapter | string | yes | Plugin | `apps_script_webhook` |
| `attempt_count` | Number of attempts | integer | yes | Plugin | Incremented on attempts |
| `last_attempt_at` | Last attempt timestamp | datetime | no | Plugin | Set on attempt |
| `last_response_code` | Last HTTP code | integer | no | Plugin | Set where available |
| `last_error` | Last error message | text | no | Plugin | Human-readable error |
| `completed_at` | Successful sync timestamp | datetime | no | Plugin | Set on success |

## Service-Area Data

Source file:

- `wp-content/plugins/megabin-onboarding/data/service-areas/megabin-pretoria-radius-geofence.geojson`

Verified implementation:

- `Geofence::approved_suburbs()` loads features where `properties.status` is `accepted` and `properties.suburb` is present.
- `Geofence::evaluate_suburb()` normalizes submitted suburb names and checks against approved names.

Logical fields:

| Field | Meaning | Type | Required | Source | Destination |
| --- | --- | --- | --- | --- | --- |
| `suburb` | Approved suburb name | string | yes | GeoJSON feature property | Search tool, signup evaluation |
| `status` | Approval status | string | yes for accepted list | GeoJSON feature property | Filter |
| `geometry` | Polygon/radius geometry | GeoJSON geometry | maybe | GeoJSON | Current code primarily uses suburb names; geometry may matter to future tooling |

Control Centre candidate: yes. Future operations may need richer service-area management, but the current website only requires launch suburb matching.

## Protected File Storage

Verified from `Protected_Storage.php` and form/PDF code:

- Once-off photos are stored under protected WordPress uploads in a plugin-managed folder.
- Agreement PDFs can be generated into a protected agreements folder.
- Folders include deny rules where supported by web server config.

Control Centre candidate:

- Future document/photo storage should probably be owned by the Control Centre or Supabase Storage, but no migration has been designed yet.

## Settings Data

Important website settings include:

- Weekly drum price.
- Once-off advertised price.
- Drum replacement fee.
- Office phone display/link.
- Primary email.
- Office notification email recipients.
- Customer email sender/reply-to values.
- Office hours.
- Social URLs.
- Legal versions.
- Debit-order URL.
- Post-signup action.
- Signup/once-off form status flags.
- Service-area GeoJSON path.
- Google Sheets sync mode, spreadsheet ID, webhook URL, webhook secret.
- reCAPTCHA status, site key, secret key.
- Tracking IDs and consent mode.
- Marketing image URLs, fit, position, and size guidance.
- Launch readiness confirmations.

Control Centre candidate:

- Business values like price, service availability, and lifecycle states should eventually be centralised or synchronised to avoid duplicate rules across apps.

## Facts, Interpretations, Unknowns

Facts verified from code:

- There are three custom plugin tables: signups, once-off requests, and sync queue.
- Both public forms save locally first.
- Google Sheets sync uses a queued Apps Script webhook adapter.
- reCAPTCHA is only enforced when configured.
- The weekly signup form currently stores sensitive identifiers in WordPress.
- Once-off photos are validated and stored in protected upload folders.

Reasonable interpretations:

- Google Sheets is a launch/office workflow bridge rather than a long-term operational backend.
- WordPress local records are the current submission source of truth.
- Future Control Centre should absorb operational lifecycle and reporting.

Unknowns:

- Whether all historical WordPress records should migrate to the Control Centre.
- Whether Google Sheets remains a parallel export after Control Centre launch.
- Exact customer/account IDs to be used in future operations.
- Supabase schema and RLS model.
- Whether debit-order provider callbacks or exports will be integrated.
