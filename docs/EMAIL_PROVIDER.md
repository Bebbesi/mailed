# Connecting Mailed to the email network

Mailed stores and serves mail, delivers between its own mailboxes, and talks to the rest of the internet through **standard, replaceable components**:

- **Outbound**: an authenticated SMTP relay (`MAIL_OUTBOUND_DRIVER=smtp`). Any provider or your own MTA works.
- **Inbound**: one or more of
  1. the **built-in SMTP receiver** (your MX record points at the worker),
  2. a **provider webhook** that posts the raw message (Cloudflare Email Routing via a Worker, Mailgun Routes, or anything that can sign a request),
  3. **IMAP polling** of a catch-all mailbox hosted by a provider.

Until outbound is configured, sending to external addresses fails immediately with a clear message, and the app shows "Outgoing mail … is not configured" in Settings → Data & storage. Nothing is silently dropped.

Throughout this guide the hosted domain is `example.com`, the web app runs at `https://mail.example.com`, and the worker's public host is `mx.example.com`.

---

## 1. Domain and DNS records

Set `MAIL_DOMAINS=example.com` (comma-separate several domains; the first one is used for new accounts).

| Record | Name | Value | Purpose |
| --- | --- | --- | --- |
| MX | `example.com` | `10 mx.example.com.` (or your provider's MX hosts) | Where other servers deliver your mail |
| A / AAAA | `mx.example.com` | IP of the worker (only for the built-in receiver) | Target of the MX |
| TXT (SPF) | `example.com` | `v=spf1 include:<your-relay's-spf-domain> -all` | Authorises your relay to send for the domain |
| TXT (DKIM) | `<selector>._domainkey.example.com` | Public key published by your relay (or your own, see `DKIM_*`) | Signs outgoing mail |
| TXT (DMARC) | `_dmarc.example.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; adkim=s; aspf=s` | Policy for unauthenticated mail claiming your domain |
| PTR | IP of `mx.example.com` | `mx.example.com.` | Only if Mailed's host sends directly; relays handle this |

Notes:

- Start DMARC with `p=none` while you check reports, then move to `quarantine` or `reject`.
- Your relay's documentation gives the exact SPF `include:` and DKIM records; many providers also require a "domain verification" TXT record.
- Optional hardening: MTA-STS (`_mta-sts` TXT plus a policy file) and TLS-RPT (`_smtp._tls` TXT).

---

## 2. Outbound: authenticated SMTP relay

```env
MAIL_OUTBOUND_DRIVER=smtp
SMTP_HOST=…
SMTP_PORT=587          # 465 with SMTP_SECURE=true for implicit TLS
SMTP_SECURE=false      # STARTTLS on 587
SMTP_REQUIRE_TLS=true
SMTP_USER=…
SMTP_PASSWORD=…
SYSTEM_MAIL_FROM="Mailed <no-reply@example.com>"
```

Typical settings (check your provider's current documentation):

| Provider | `SMTP_HOST` | `SMTP_USER` | `SMTP_PASSWORD` |
| --- | --- | --- | --- |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | SES SMTP username | SES SMTP password (not your IAM secret) |
| Postmark | `smtp.postmarkapp.com` | Server API token | Server API token |
| Mailgun | `smtp.mailgun.org` (EU: `smtp.eu.mailgun.org`) | SMTP login for the domain | SMTP password |
| SendGrid | `smtp.sendgrid.net` | `apikey` | API key |
| Resend | `smtp.resend.com` | `resend` | API key |
| Brevo | `smtp-relay.brevo.com` | Brevo SMTP login | SMTP key |

How sending works:

1. *Send* moves the draft to Sent with status `queued` (or `scheduled`) and enqueues a job. The undo window (Settings → General) delays the job.
2. The worker builds the RFC 5322 message (Bcc never appears in headers), stores the exact bytes, delivers local recipients directly, and hands external recipients to the relay in a single envelope.
3. Temporary errors (4xx, connection problems) are retried with backoff: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h. Permanent errors (5xx) mark the message *Not delivered* with the server's reason and notify the user, who can retry.
4. Delivery status notifications (bounces) that come back to the sender's address are parsed; the original message is marked *bounced* with the recipient's diagnostic.

If your relay does not sign with DKIM, Mailed can sign itself:

```env
DKIM_DOMAIN=example.com
DKIM_SELECTOR=mailed
DKIM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"
```

Generate a key with `openssl genrsa -out dkim.pem 2048` and publish `mailed._domainkey.example.com TXT "v=DKIM1; k=rsa; p=<base64 public key>"`.

Mailed does not deliver directly to recipients' MX servers: most cloud networks block outbound port 25, and direct delivery from unknown IPs has poor reputation. Use a relay.

---

## 3. Inbound option A: built-in SMTP receiver

```env
INBOUND_SMTP_ENABLED=true
INBOUND_SMTP_HOST=0.0.0.0
INBOUND_SMTP_PORT=2525
INBOUND_SMTP_TLS_KEY_PATH=/etc/letsencrypt/live/mx.example.com/privkey.pem
INBOUND_SMTP_TLS_CERT_PATH=/etc/letsencrypt/live/mx.example.com/fullchain.pem
INBOUND_SMTP_VERIFY_SENDER=true
```

- Other servers connect on port **25**. Either run the worker with permission to bind port 25 (`INBOUND_SMTP_PORT=25` with `CAP_NET_BIND_SERVICE`), or keep 2525 and forward 25 → 2525 at your load balancer or firewall.
- The receiver accepts mail only for `MAIL_DOMAINS`, rejects unknown mailboxes at `RCPT TO` (`550`), refuses relaying (`554`), enforces the size limit (`552`) and rate limits per client IP.
- SPF, DKIM and DMARC are verified for every message (`INBOUND_SMTP_VERIFY_SENDER`); the results feed the spam filter and the "Security" line in message details.
- Test it: `npm run mail:test-inbound -- --to you@example.com --host mx.example.com --port 25`, or `swaks --to you@example.com --server mx.example.com`.

## 3. Inbound option B: provider webhook

### Generic signed endpoint — `POST /api/inbound/raw`

Body: the raw message (`Content-Type: message/rfc822`). Headers:

| Header | Value |
| --- | --- |
| `X-Mailed-Timestamp` | Unix time in seconds (must be within 5 minutes) |
| `X-Mailed-Signature` | Hex HMAC-SHA256 of `"<timestamp>." + body` using `INBOUND_WEBHOOK_SECRET` |
| `X-Mailed-Envelope-To` | Envelope recipient(s), comma-separated (recommended) |
| `X-Mailed-Envelope-From` | Envelope sender (optional) |

Responses: `200` with `{ delivered, rejected }`, `401` bad signature, `413` too large, `422` permanent rejection (no such mailbox, unparseable), `503` temporary failure (retry).

### Cloudflare Email Routing

1. Enable Email Routing for `example.com` (Cloudflare manages the MX records).
2. Create an Email Worker with the code below; set the secrets `MAILED_INBOUND_URL=https://mail.example.com/api/inbound/raw` and `MAILED_WEBHOOK_SECRET` (same value as `INBOUND_WEBHOOK_SECRET`).
3. Add a catch-all routing rule: *Send to a Worker* → this Worker.

```js
// Cloudflare Email Worker
export default {
  async email(message, env) {
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const ts = Math.floor(Date.now() / 1000).toString();
    const prefix = new TextEncoder().encode(`${ts}.`);
    const signed = new Uint8Array(prefix.length + raw.length);
    signed.set(prefix);
    signed.set(raw, prefix.length);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.MAILED_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
    const signature = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");

    const res = await fetch(env.MAILED_INBOUND_URL, {
      method: "POST",
      headers: {
        "content-type": "message/rfc822",
        "x-mailed-timestamp": ts,
        "x-mailed-signature": signature,
        "x-mailed-envelope-to": message.to,
        "x-mailed-envelope-from": message.from,
      },
      body: raw,
    });
    if (res.status === 422 || res.status === 413) {
      message.setReject("Mailbox unavailable");
    } else if (!res.ok) {
      // Surfaces as a failed delivery in Cloudflare's logs; see their docs for retry behaviour.
      throw new Error(`Mailed responded ${res.status}`);
    }
  },
};
```

With this setup Cloudflare performs SPF/DKIM/DMARC checks and adds an `Authentication-Results` header, which Mailed reads.

### Mailgun Routes

1. Set `MAILGUN_WEBHOOK_SIGNING_KEY` (Mailgun → Sending → Webhooks → signing key).
2. Create a route with the expression `match_recipient(".*@example.com")` and the action `forward("https://mail.example.com/api/inbound/mailgun/mime")`. URLs ending in `mime` make Mailgun post the full message as `body-mime`.
3. Mailgun's MX records go on your domain.

## 3. Inbound option C: IMAP catch-all

For providers that can collect all mail for the domain into one mailbox:

```env
IMAP_ENABLED=true
IMAP_HOST=imap.provider.example
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=catchall@example.com
IMAP_PASSWORD=…
IMAP_MAILBOX=INBOX
IMAP_POLL_INTERVAL_SECONDS=60
IMAP_PROCESSED_MAILBOX=Processed   # optional
```

The worker keeps an IDLE connection and also polls. It imports by UID, saves its position after every message, retries with backoff after errors, and skips messages already stored (same `Message-ID`), so restarts and re-syncs never create duplicates. Recipients are taken from `Delivered-To`/`X-Original-To`, then `To`/`Cc`; make sure your provider keeps one of the first two for Bcc'd mail.

---

## 4. Optional spam services

```env
RSPAMD_URL=http://rspamd:11334     # adds Rspamd's verdict to the score
DNSBL_ENABLED=true                 # checks link domains against DBL zones
DNSBL_DOMAIN_ZONES=dbl.spamhaus.org
```

DNS blocklists have usage terms; Spamhaus does not answer queries forwarded by large public resolvers. Use your own resolver or a data-query service key.

## 5. Checklist

- [ ] `GET /api/health` returns `{"status":"ok","worker":"ok"}`
- [ ] Settings → Data & storage says outgoing mail is enabled
- [ ] Send to an external address you control; check headers show `spf=pass`, `dkim=pass`, `dmarc=pass`
- [ ] Reply from that address; the reply lands in the same conversation
- [ ] Send to a non-existent external address; the message is marked *Not delivered* (bounce) within a few minutes
- [ ] Register a new account; the confirmation email arrives at the recovery address

## 6. Troubleshooting

| Symptom | Check |
| --- | --- |
| "no outbound email provider is configured" | `MAIL_OUTBOUND_DRIVER=smtp` and `SMTP_HOST` set in the worker **and** web environment |
| Messages stuck in *Sending* | Is the worker running? `jobs` table has `pending` rows with `run_at` in the past |
| Mail from outside never arrives | MX record target, port 25 reachability (`nc -vz mx.example.com 25`), worker logs `inbound SMTP server listening` |
| Inbound accepted but not visible | Recipient must exist; plus-addressing (`you+tag@`) is supported; check Spam |
| Webhook returns 401 | Clock skew over 5 minutes or a different secret |
| Outgoing mail lands in recipients' spam | SPF/DKIM/DMARC alignment, a sending domain with history, reverse DNS of the relay |
