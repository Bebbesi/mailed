# Mailed

Mailed is a self-hostable email service: a web app where people get an address on your domain, read, write and organise mail, and are protected from spam and phishing. It includes the full stack — web UI, API, PostgreSQL data model, background worker, an SMTP receiver, and integrations with standard email providers.

> **Mail delivery depends on configuration.** Out of the box Mailed delivers mail **between its own mailboxes** with no external service. Sending to and receiving from the rest of the internet requires a domain with DNS records and an outbound SMTP provider (and an inbound path such as an MX record). See [docs/EMAIL_PROVIDER.md](docs/EMAIL_PROVIDER.md). The app tells users plainly when external delivery is not configured.

## Features

- **Mailbox** — Inbox with category tabs (Primary, Social, Promotions, Updates, Forums, Ads), Starred, Snoozed, Important, Sent, Scheduled, Drafts, Archive, Spam, Trash, All mail and custom labels; conversation threading by `Message-ID`/`In-Reply-To`/`References`; unread counts; bulk selection and actions; progressive loading; reading pane or full-page view; keyboard shortcuts.
- **Composer** — floating, resizable window or full page; recipient chips with contact suggestions; Cc/Bcc; rich text (bold, italic, underline, links, lists, quotes); attachments with progress and validation; autosave with status; undo send; scheduled send; replies and forwards with quoted original.
- **Spam and phishing protection** — probabilistic scoring of sender authentication (SPF/DKIM/DMARC), links (IP hosts, look-alike domains, mismatched anchors, shorteners), attachments, headers and content, plus a per-user Bayesian model trained by *Report spam* / *Not spam*, aggregate domain reputation, blocked/trusted senders, and optional Rspamd and DNS blocklist integrations. Suspicious messages get explained warnings; links ask for confirmation; remote images never load automatically there.
- **Organisation** — automatic categories (learns when you move a sender), labels, filters/rules (applied on arrival or to existing mail), snooze, reply reminders, contacts with favourites.
- **Search** — PostgreSQL full-text search with Gmail-style operators: `from:`, `to:`, `subject:`, `has:attachment`, `is:unread`, `in:`, `label:`, `category:`, `after:`, `before:`, `newer_than:`, `larger:`, `filename:`, `"exact phrase"`, `-exclude`.
- **Accounts** — registration with a verified recovery email, sign-in, password reset, active sessions with remote sign-out, security activity log, profile and avatar, data export (JSON + mbox), mbox/eml import, account deletion.
- **Realtime** — new mail and send status pushed over Server-Sent Events (PostgreSQL `LISTEN/NOTIFY`), with in-app and optional desktop notifications.
- **Design** — light theme by default with an optional dark theme, responsive from phone to desktop, WCAG 2.2 AA checks in the end-to-end tests.

## Architecture at a glance

```
 Browser ──HTTPS──▶ Next.js (App Router: pages + /api route handlers)
                     │  sessions, validation, authorisation per resource
                     ▼
                PostgreSQL ◀── LISTEN/NOTIFY (realtime + job wake-ups) ──┐
                     ▲                                                   │
                     │                                                   │
 Internet MX ─SMTP─▶ Worker process ── jobs: send, import ── SMTP relay ─┴─▶ Internet
 Provider webhooks ─▶ /api/inbound/*        periodic: snooze, reminders, retention
 IMAP catch-all ◀──── Worker (poller)
                     │
              Object storage (local disk or S3-compatible) for raw messages and attachments
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Security model: [SECURITY.md](SECURITY.md)

## Requirements

- Node.js 20.11+ (22 recommended)
- PostgreSQL 14+
- Optional: Redis (distributed rate limiting), an S3-compatible bucket, Rspamd

## Quick start (development)

```bash
cp .env.example .env                 # then set APP_SECRET (openssl rand -base64 48)
docker compose up -d                 # PostgreSQL, Redis and Mailpit (optional; use your own Postgres if you prefer)
npm install
npm run db:migrate
npm run dev                          # web on :3000 and the worker (jobs + SMTP receiver if enabled)
```

Open http://localhost:3000 and create an account. Without an outbound provider, verification and password-reset emails are written to `storage/dev-outbox/` and the link is printed in the server log (development only).

Optional helpers:

```bash
npm run seed:dev                                    # sample mailbox (alice@<domain>, password demo-password-123)
npm run user:create -- --username bob --first Bob --last Bianchi --recovery bob@example.org --password '…'
INBOUND_SMTP_ENABLED=true npm run dev               # start the SMTP receiver on :2525, then:
npm run mail:test-inbound -- --to bob@mailed.local  # deliver a message over SMTP like an external server would
```

To try outbound SMTP locally without sending anything to the internet, point Mailed at Mailpit from `docker-compose.yml`:

```bash
MAIL_OUTBOUND_DRIVER=smtp SMTP_HOST=localhost SMTP_PORT=1025 SMTP_REQUIRE_TLS=false
# captured messages: http://localhost:8025
```

## Mail delivery status

| Scenario | Works without a provider? | What you need |
| --- | --- | --- |
| Mail between Mailed addresses on the same server | Yes (`LOCAL_DELIVERY=true`) | Nothing |
| Receiving from the internet | No | MX record to the built-in SMTP receiver, **or** a provider webhook (Cloudflare Email Routing, Mailgun), **or** an IMAP catch-all mailbox |
| Sending to the internet | No | An authenticated SMTP relay (Amazon SES, Postmark, Mailgun, SendGrid, Resend, Brevo, your own MTA) and SPF/DKIM/DMARC records |
| Verification and password-reset emails | Only to local addresses | Same as sending |

Step-by-step instructions and DNS records: [docs/EMAIL_PROVIDER.md](docs/EMAIL_PROVIDER.md).

## Production

1. Provision PostgreSQL and (recommended) an S3-compatible bucket; set `STORAGE_DRIVER=s3`.
2. Configure `.env` from `.env.example`: `APP_URL` (https), `APP_SECRET`, `DATABASE_URL`, `MAIL_DOMAINS`, outbound SMTP and at least one inbound path. Set `TRUST_PROXY=true` only behind a reverse proxy that sets `X-Forwarded-For`.
3. `npm ci && npm run build && npm run db:migrate`
4. Run two processes (or containers from the `Dockerfile`):
   - web: `npm start`
   - worker: `npm run worker` (sending, scheduled mail, snooze, reminders, retention, SMTP receiver, IMAP poller)
5. Put the web app behind TLS. The session cookie uses the `__Host-` prefix and `Secure` in production.
6. Check `GET /api/health`.

The worker can run as several replicas: jobs are claimed with `FOR UPDATE SKIP LOCKED`. Run only one IMAP poller per mailbox.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Web app and worker with reload |
| `npm run build` / `npm start` | Production build / server |
| `npm run worker` | Background worker |
| `npm run db:generate` / `npm run db:migrate` | Create / apply Drizzle migrations |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit and integration tests (needs PostgreSQL) |
| `npm run test:e2e` | Playwright end-to-end and accessibility tests |
| `npm run seed:dev` | Development sample data (refuses to run in production) |

## Testing

- `npm test` runs Vitest against a dedicated database (default `postgres://mailed:mailed@localhost:5432/mailed_test`, override with `TEST_DATABASE_URL`). Migrations are applied automatically. Suites cover authentication, cross-account authorisation, ingestion, threading, classification, sending (including retries, undo and scheduling), folder actions, search, attachments, webhooks, the SMTP receiver, and import/export.
- `npm run test:e2e` starts (or reuses) the dev server and runs browser tests with axe-core accessibility checks and responsive layout checks.

## Project layout

```
src/app/            pages (marketing, auth, /app) and API route handlers (/api)
src/components/     UI: design-system primitives, mail client, settings
src/lib/            server code: auth, db schema, mail pipeline, classifier, search, services, storage
src/worker/         worker entry, SMTP receiver, IMAP poller
drizzle/            SQL migrations
scripts/            CLI helpers
tests/              unit, integration and e2e tests
docs/               architecture and email provider guides
```

## Known limitations

- The interface is in English. The language setting controls date, time and number formatting.
- Mailed does not expose IMAP/POP/SMTP submission for third-party mail clients; it is used through the web app.
- Attachments are checked by type and content signature; there is no antivirus scanning. Integrating ClamAV in the ingestion pipeline is a natural extension.
- Desktop notifications work while Mailed is open in a tab (no Web Push service worker).
- Bounce handling relies on delivery status notifications sent back to the sender address; provider-specific bounce webhooks are not implemented.
