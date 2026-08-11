# MegaBin Context

> **Document status: legacy/source context.** This file supplies website and business background; it does not override the Control Centre blueprint or approved ADRs.

## Verified Business Context

MegaBin provides garden refuse collection services for Pretoria and Centurion customers. The public website is designed to explain the service, collect new weekly collection signups, collect once-off garden refuse collection quote requests, and support office review before service activation or invoicing.

The website is a WordPress build with:

- A lightweight custom Elementor-compatible theme: `wp-content/themes/megabin/`
- A separate custom onboarding plugin: `wp-content/plugins/megabin-onboarding/`

Critical business logic is implemented in the plugin, not in Elementor templates.

## Main Service Types

### Weekly Collection

Customers request one or more MegaBin drums for recurring weekly garden refuse collection. The website captures the customer's details, service address, access notes, drum quantity, billing date, legal acceptance, attribution, and service-area result.

The form starts saved signups as `debit_order_pending`. A submitted form is not an active client.

### Once-Off Collection

Customers request a quote for a once-off garden refuse collection. The website captures contact details, collection address, load description, estimated loads, optional photos, terms acceptance, marketing consent, and attribution.

The form starts once-off requests as `quote_pending`. Payment is expected by EFT after invoice.

## Important Terminology

- `Recurring signup` - a weekly collection application submitted through the website.
- `Once-off request` - a quote request for a once-off garden refuse load.
- `Approved suburb` - a suburb listed as accepted in the service-area GeoJSON.
- `Manual review` - office review required where suburb/service-area or operational details need confirmation.
- `Local save first` - the website stores submissions in WordPress before any external sync.
- `Sync queue` - WordPress table used to retry Google Sheets sync safely.
- `Agreement reference` - unique reference for the accepted weekly service legal snapshot.
- `Signup reference` / `request reference` - customer-facing identifiers for saved submissions.

## Website Purpose

The website is responsible for:

- Public marketing pages.
- Menu/header/footer and responsive presentation.
- Editable marketing content, images, proof points, and page copy where appropriate.
- Weekly collection signup capture.
- Once-off quote request capture.
- Service-area suburb lookup.
- Legal document rendering.
- Local WordPress record storage.
- Office/customer email notifications.
- Google Sheets queueing and sync.
- Tracking snippet/event output from settings.
- Launch readiness and smoke-test support.

## Customer Onboarding Process

Verified from `Signup_Form.php`, `Notifications.php`, `Sheet_Sync.php`, and `Launch_Pages.php`:

1. Customer submits weekly signup details on the Weekly Collection page.
2. WordPress validates nonce, required fields, reCAPTCHA where configured, duplicate/rate rules, and form data.
3. Suburb is matched against the configured GeoJSON service-area source.
4. Submission is saved locally in `wp_megabin_signups`.
5. Office and customer notifications are sent.
6. Google Sheets sync is queued.
7. The customer sees confirmation/success state.
8. The office reviews the signup.
9. After office acknowledgement, the plugin can send a welcome email containing the configured debit-order mandate link, or office staff can help by phone.

## Relevant Customer Lifecycle Concepts

Currently represented in website code:

- `debit_order_pending`
- `office_acknowledged`
- `quote_pending`
- `not_synced`
- `sync_queued`
- `synced`
- `sync_failed`
- `manual_area_review`
- `service_available`

Discussed or documented but not fully implemented as operational lifecycle in the website:

- Delivery scheduling.
- Route team assignment.
- Collection day assignment.
- Active client management.
- Account suspension or cancellation workflows.
- Drum recovery workflow.

These future lifecycle concepts should belong primarily to the Control Centre, not WordPress.

## Systems Currently Involved

Verified systems:

- WordPress.
- Custom MegaBin theme.
- Custom MegaBin onboarding plugin.
- WordPress database tables created by the plugin.
- WordPress mail transport through `wp_mail`.
- Google Apps Script webhook.
- Google Sheets.
- Google reCAPTCHA v2 checkbox, if configured.
- Marketing/tracking platforms configured by IDs in WordPress settings.
- External debit-order mandate provider URL stored in settings and used in office-controlled welcome email.

Local/development systems:

- Local static preview files in `dist/`.
- Local Node tooling for service-area/map development and previews.

## Website Responsibilities That Should Not Grow Further

The website should not become the operational control system. Future Control Centre work should avoid adding these responsibilities to WordPress unless there is a deliberate integration boundary:

- Customer portal or customer authentication.
- Internal operations dashboards beyond launch support.
- Route assignment.
- Collection-day scheduling.
- Staff workflow management.
- Debit-order mandate status management.
- Invoice/payment status management.
- Long-term client account lifecycle.
- Supabase database ownership.
- Operations analytics beyond basic marketing attribution and lead capture.

## Relevant Assumptions Found

Verified facts:

- The current weekly price is controlled by settings and defaults to R195.
- The current once-off advertised price is controlled by settings and defaults to R650.
- The current public contact number is `074 445 0905`.
- Office lead notifications currently use `leads@megabin.co.za` by default.
- Google Sheets sync is optional and settings-controlled.
- reCAPTCHA is settings-controlled and only enforced when configured.
- The service-area source is a GeoJSON file loaded by the plugin.

Reasonable interpretations:

- Google Sheets is a launch-stage operational bridge and may later be replaced or reduced by the Control Centre.
- WordPress local records are the current source of truth for submitted website leads until a Control Centre API exists.
- The future Control Centre should own operational state after office review.

Unknowns requiring future decisions:

- Final Control Centre data schema.
- Whether Google Sheets remains in use after Control Centre launch.
- Whether the Control Centre will import historical WordPress submissions.
- Authentication model for staff in the Control Centre.
- Exact API boundary between WordPress and the Control Centre.
- Whether debit-order status will be polled/imported or manually updated in the Control Centre.
