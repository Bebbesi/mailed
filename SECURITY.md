# Security

## Reporting

Please report vulnerabilities privately to the maintainers of this repository rather than opening a public issue. Include steps to reproduce and the affected version.

## Controls

**Authentication and sessions**
- Passwords are hashed with Argon2id (19 MiB, t=2, p=1). Minimum length 10; common passwords rejected. Unknown accounts take as long to reject as wrong passwords.
- Session tokens are 256-bit random values; only their SHA-256 is stored. Cookies are `HttpOnly`, `SameSite=Lax`, `Secure` and `__Host-` prefixed in production. Sessions slide for 30 days and can be revoked individually or all at once.
- Verification and reset tokens are hashed, single-use, short-lived and bound to the address they were sent to. A password reset signs out every session; a password change signs out all other sessions.
- Password reset only goes to a confirmed recovery email, and responses never reveal whether an account exists.

**Authorisation**
- Every API handler resolves the session server-side; every query is scoped to the session's user. Foreign IDs behave like non-existent ones (404 or no effect). Covered by integration tests.

**Request forgery and injection**
- State-changing API requests must come from the app's own origin (Origin/Host check); webhooks use HMAC signatures with a timestamp instead.
- All SQL goes through Drizzle with bound parameters. Search terms are reduced to letters and digits before building `to_tsquery` expressions; `LIKE` patterns are escaped.
- Inputs are validated with zod on the server; the client-side validation is only for convenience.

**Untrusted content**
- Message HTML is sanitised on arrival and rendered in a sandboxed frame with no script execution and a restrictive CSP; remote images are blocked by default and always in suspicious messages.
- The app sends a nonce-based Content Security Policy, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and HSTS in production.

**Files**
- Uploads are limited in size, checked by extension and by content signature (Windows/ELF/Mach-O executables and scripts are refused), and stored under per-user keys.
- Downloads require an authorised request and use URLs that expire after two minutes; files are always served as attachments except images displayed inline, with `nosniff` and a sandbox CSP. Dangerous inbound attachments cannot be downloaded; attachments from suspicious messages require confirmation.

**Abuse**
- Rate limits (PostgreSQL or Redis) on sign-in per IP and per account, registration, password reset, verification emails, sending (per hour and per day), uploads, imports, the SMTP receiver and webhooks.
- Accounts must confirm their recovery email before sending outside the server.

**Logging and privacy**
- Logs are structured JSON with redaction of passwords, tokens, cookies and message bodies. Security events are stored per user and shown in Settings → Security.
- Users can export their data (JSON and mbox) and delete their account, which removes all rows and stored files immediately. Trash and Spam are purged after 30 days.

**Secrets**
- No secrets reach the browser. Configuration lives in environment variables validated at startup (`src/lib/env.ts`).

## Dependency notes

`npm audit` currently reports advisories in development-only tooling (`drizzle-kit`'s bundled esbuild and a transitive `braces`); they are not part of the runtime bundle.
