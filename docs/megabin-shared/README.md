# MegaBin Shared Context

> **Document status: legacy/source context.** These files describe the separate MegaBin WordPress website and its migration/integration context. They are not authoritative Control Centre architecture and must not override the [Control Centre architecture index](../architecture/architecture-index.md) or [system blueprint](../architecture/megabin-control-centre-system-blueprint.md).

This folder is a shared context package for the MegaBin ecosystem.

It belongs inside the current MegaBin Website repository for now, but it is intentionally written so it can later be copied into or referenced from:

```text
megabin-control-centre/docs/website-context/
```

The current repository should be understood as `megabin-website`, not as the entire MegaBin software platform. The future MegaBin Control Centre must be a separate application/project/repository.

## Documents

- `MEGABIN_CONTEXT.md` - business and website context.
- `MEGABIN_DATA_MODEL.md` - data currently captured, stored, synced, or referenced by the website.
- `MEGABIN_WEBSITE_INTEGRATIONS.md` - integrations and external communication.
- `MEGABIN_BUSINESS_RULES.md` - business rules enforced or assumed by the website/plugin.
- `MEGABIN_API_CONTRACTS.md` - current machine-to-machine contracts and future interface considerations.
- `CONTROL_CENTRE_HANDOVER.md` - concise handover from website implementation to future Control Centre development.
- `WEBSITE_IDENTITY_AND_RENAME_IMPACT.md` - impact assessment for conceptually renaming the website project to `megabin-website`.

## Documentation Rules

- Prefer relative code references such as `wp-content/plugins/megabin-onboarding/includes/Signup_Form.php`.
- Separate verified facts from interpretations and open questions.
- Keep secrets out of documentation.
- Do not include raw webhook secrets, reCAPTCHA keys, SMTP credentials, WordPress credentials, hosting credentials, tracking IDs, or private tokens.
- Avoid copying exact sensitive URLs where a settings key is enough.
- Keep this useful as AI/Codex context: clear, scoped, and not overloaded with implementation noise.

## Current Boundary

```text
megabin-website
  WordPress public website
  Custom theme
  Custom onboarding plugin
  Local WordPress submission storage
  Google Sheets sync adapter

megabin-control-centre
  Future separate operational application
  Future Supabase-backed system
  Future owner of deeper operational workflows

shared-docs
  Business, data-model, integration, and handover context
```

Do not turn the website repository into a monorepo for the future Control Centre.
