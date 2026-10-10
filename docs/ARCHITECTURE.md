# Architecture

## Processes

| Process | Entry | Responsibilities |
| --- | --- | --- |
| Web | `next start` (Next.js App Router) | Pages, REST route handlers under `/api`, Server-Sent Events, inbound webhooks |
| Worker | `src/worker/index.ts` | Job queue (sending, imports), periodic tasks (snooze wake-up, reminders, retention, housekeeping), SMTP receiver, IMAP poller |

Both share the code in `src/lib` and coordinate only through PostgreSQL and object storage, so either can be scaled independently.

## Layers

```
src/app/api/**/route.ts     HTTP: authentication, CSRF origin check, input validation (zod), error mapping
        │  authed()/publicRoute() in src/lib/api/handler.ts
src/lib/services/*          Use cases: mailbox listing, actions, compose/send, labels, contacts, rules, settings…
src/lib/mail/*              Mail pipeline: parse, sanitise, compose MIME, ingest, rules, transports
src/lib/classify/*          Spam/phishing/category scoring, per-user Bayes, external verdicts
src/lib/search/*            Query parser and SQL translation
src/lib/db/schema.ts        Drizzle schema (single source for migrations in ./drizzle)
src/lib/storage/*           Local disk or S3-compatible object storage, signed URLs
```

Every service function takes the authenticated `userId` and filters every query by it; IDs from the client are never trusted on their own. Integration tests in `tests/integration/authorization.test.ts` exercise this with a second account.

## Data model

| Table | Notes |
| --- | --- |
| `users` | Mailbox address (unique), recovery email (unique, verified), Argon2id hash, quota |
| `sessions` | `id = sha256(token)`; the token only lives in an HttpOnly cookie. Sliding 30-day expiry |
| `auth_tokens` | Hashed single-use tokens for email verification (48 h) and password reset (1 h) |
| `user_settings` | Theme, density, signature, locale/time zone, reading pane, notifications, undo window… |
| `threads` | One per conversation per user |
| `messages` | Both directions. `folder` (inbox, sent, drafts, archive, spam, trash) is the system folder; `restore_folder` remembers where Trash/Spam items came from; `category`, flags (read, starred, important), `snoozed_until`, `sort_date` (moves forward when a snooze or reminder resurfaces a message), spam score, classification and security JSON, send status, `dedupe_key` (unique per user), generated `search_vector` (GIN) |
| `message_recipients` | To/Cc/Bcc rows; Bcc only stored for the sender's copy |
| `attachments` | Metadata + storage key; `is_dangerous` blocks download |
| `labels`, `message_labels` | User labels, many-to-many |
| `contacts` | Auto-saved recipients and manual contacts |
| `sender_lists` | Blocked/trusted addresses or domains |
| `sender_categories` | Learned "always file this sender under X" |
| `email_rules` | Filters (conditions + actions, JSON) |
| `reminders` | Follow-up reminders, optionally "only if no reply" |
| `notifications` | In-app notifications |
| `classifier_tokens`, `classifier_stats` | Per-user Bayesian model |
| `domain_reputation` | Aggregate counts per sending domain (no content) |
| `jobs` | Durable queue: `FOR UPDATE SKIP LOCKED`, retries with backoff, `unique_key` for idempotency |
| `rate_limits` | Fixed-window counters when Redis is not configured |
| `security_events` | Sign-ins, password changes, exports… |
| `imap_sync_state` | UID validity and last UID per polled mailbox |

System folders are an enum rather than rows, so their behaviour (restore, retention, counts) is the same for everyone; user-defined organisation uses labels, which a conversation can have several of.

## Receiving mail

`ingestRawMessage()` in `src/lib/mail/ingest.ts` is the single entry point for the SMTP receiver, IMAP poller, webhooks, local delivery and imports:

1. Size check, MIME parsing (mailparser).
2. Recipient resolution: SMTP envelope when present, otherwise `Delivered-To`/`X-Original-To`, then `To`/`Cc`; plus-addressing maps to the base mailbox.
3. Signals computed once: HTML analysis, link report, optional Rspamd and DNSBL lookups, sender domain reputation.
4. Per recipient: idempotency via `dedupe_key` (`Message-ID` or a content hash), quota check, raw message and attachments written to storage, thread resolution via `In-Reply-To`/`References`, classification with the user's context (contacts, sender lists, learned categories, Bayes model), filters, then one transaction for the message, recipients, attachments and labels. A concurrent duplicate loses on the unique index and is skipped.
5. Delivery status notifications mark the original outbound message as bounced.
6. Notification row (unless muted) and a `pg_notify` event for open sessions.

## Classification

`scoreMessage()` (pure, unit-tested) produces:

- **Spam probability**: log-odds sum of weighted features — authentication results, sender relationship, phishing indicators, scam language, subject style, link features, attachment types, header anomalies, bulk-mail hygiene, domain reputation, the user's Bayesian model, optional external verdicts — through a sigmoid. Messages at ≥ 0.85 go to Spam. Trusted/blocked lists override. Every contributing feature is stored with a human-readable reason shown in "Why is this message in Spam?".
- **Phishing flag**: brand impersonation in the display name, spoofed display addresses, mismatched or IP links, credential-request language combined with links, HTML attachments, DMARC failure.
- **Category**: scores for each category, softmax probabilities. *Ads* requires explicit advertising signals (labels such as `[ADV]`, declared sponsorship, ad-network links) and must beat *Promotions*, so ordinary newsletters stay in Promotions. Moving a sender's mail to a category teaches Mailed to file that sender there.

*Report spam* / *Not spam* train the per-user model (reversible if the user changes their mind) and update domain reputation.

## Sending mail

`sendDraft()` validates recipients, verification status, provider availability, size and rate limits, then marks the message `queued`/`scheduled` and enqueues `send_message` with `unique_key = send:<id>`. Undo and "cancel schedule" delete the pending job atomically; if a worker already claimed it, the API reports that it is too late. `processSendJob()` builds the MIME message, delivers locally and/or via the transport, retries temporary failures and records permanent ones.

## Realtime

Events are published with `pg_notify('mailed_events', …)`, inside the same transaction when applicable. Each web process holds one `LISTEN` connection and fans events out to the user's open `/api/events` streams. The stream re-validates the session on each heartbeat. Clients also poll as a fallback, so a dropped connection only delays updates.

## Storage

Keys are namespaced per user (`u/<userId>/…`), which makes account deletion a single prefix delete. Downloads go through an authorised API route that returns a URL valid for two minutes: an S3 presigned URL, or for local storage `/api/files/<signed token>`. Inline images referenced by `cid:` are rewritten to signed URLs when a thread is loaded.

## Rendering untrusted HTML

1. Server: sanitize-html allow-list (no scripts, forms, iframes, SVG, event handlers, `javascript:` URLs; CSS filtered), links forced to `target=_blank rel=noopener noreferrer nofollow`.
2. Client: a sandboxed `<iframe srcdoc>` without `allow-scripts`, plus a CSP meta tag that blocks every remote load unless the reader chose to show images. Link clicks in suspicious messages require confirmation showing the real destination.
3. Page CSP with per-request nonces (`src/proxy.ts`) as a final layer.
