# ReplyConnect Server-Ready MVP Design

**Status:** Approved for implementation

## Goal

Prepare the deterministic Instagram comment and inbound-DM automation MVP as a standalone ReplyConnect project that can run on the existing private server through Coolify and Cloudflare.

## Product scope

ReplyConnect lets a connected Instagram Professional account owner create explicit keyword or any-message rules. Official Meta webhooks enter the application, the rule engine evaluates the saved trigger/condition/action definition, and a worker sends the configured private comment reply or direct message. There is no AI generation, scraping, follower blast, WhatsApp, billing, or bulk cold messaging.

## Runtime architecture

```text
Cloudflare → Coolify web service → Next.js dashboard/API
                                  ├─ dedicated PostgreSQL database
                                  └─ private Valkey/Redis service
                         Coolify worker service → BullMQ → Meta Graph API
```

The web and worker services use the same repository and environment contract but run as separate long-lived processes. PostgreSQL and Valkey are dedicated to ReplyConnect; TrackParcel data, services, and credentials are not shared. Valkey has no public port or domain.

## Deployment contract

- Public HTTPS is terminated by Cloudflare and routed to the Coolify web service.
- The Meta OAuth callback, webhook, data-deletion callback, legal pages, and support page are public at the configured ReplyConnect domain.
- The web service starts with `pnpm start`; the worker starts with `pnpm worker`.
- Meta secrets, token-encryption keys, database credentials, and Redis credentials are server-only Coolify secrets.
- Database migrations run explicitly during deployment; application startup does not silently mutate production schema.

## Completion criteria

- The standalone project contains no legacy product-name references in source, runtime identifiers, docs, tests, or public copy.
- The project has local and Coolify deployment documentation, private data-service configuration, health checks, and a safe environment template.
- Lint, unit tests, end-to-end smoke tests, and a production build pass from a clean dependency install.
- Remaining launch work is clearly separated into server configuration, Meta testing/review, and product-hardening tasks.
