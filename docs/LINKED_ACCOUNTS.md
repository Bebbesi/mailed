# Linked accounts (Gmail, Outlook, Yahoo, iCloud, any IMAP)

Users can link other mailboxes in **Settings → Linked accounts** and read and send that mail in Mailed:

- The worker copies the last `LINKED_BACKFILL_DAYS` (30) days of the account's **Inbox**, at most `LINKED_BACKFILL_MAX` (500) messages, without notifications. After that it checks for new mail every `LINKED_POLL_INTERVAL_SECONDS` (60). New mail goes through filters and notifications like any other.
- Every message from the account gets a label named after the address, so the sidebar shows a per-account view next to the combined Inbox.
- Replies go out from the address the message was sent to. The composer's **From** menu lists every linked address that has sending turned on. Mail is sent through the account's own SMTP server, so it doesn't need the server-wide relay from [EMAIL_PROVIDER.md](EMAIL_PROVIDER.md).
- The provider has already filtered spam out of its Inbox, so Mailed never moves linked mail to Spam on its own score. Phishing and suspicious-link warnings still apply, and so do your filters.

## What it doesn't do

- **One-way copy.** Reading, archiving or deleting in Mailed doesn't change the original mailbox.
- **Inbox only.** Other folders aren't fetched, including Sent, Spam and Gmail labels. Mail you send from the provider's own app doesn't appear in Mailed's Sent.
- **Sent copies at the provider.** Gmail and Outlook keep a copy of mail sent through their SMTP servers in their Sent folder. Yahoo, iCloud and other providers may not.
- **Storage.** Fetched mail counts towards the user's Mailed storage quota.
- **Worker required.** Mail arrives only while the worker (`npm run worker`, or `npm run dev`) is running.

## Signing in

| Provider | How | Notes |
| --- | --- | --- |
| Gmail | App password, or *Sign in with Google* when configured | App passwords need 2-Step Verification: <https://myaccount.google.com/apppasswords>. Paste the 16 letters; the spaces are removed. |
| Outlook, Hotmail, Live | *Sign in with Microsoft* (required) | Microsoft no longer accepts passwords from other apps, so set up the Microsoft app below. |
| Yahoo | App password | Account security → Generate app password. |
| iCloud | App-specific password | Apple Account → Sign-In and Security → App-Specific Passwords. |
| Other | Password and server settings | IMAP on 993 (TLS) or 143 (STARTTLS); SMTP on 465 (TLS), 587 (STARTTLS), 25 or 2525. |

Mailed tests the IMAP and SMTP sign-in before saving an account. Passwords and refresh tokens are stored encrypted (AES-256-GCM) with a key derived from `APP_SECRET`. **If you change `APP_SECRET`, every linked account has to be reconnected.**

If a provider starts rejecting the credentials, for example after a password change or a revoked app password, Mailed stops trying. This avoids getting the account locked. The user gets a notification and a **Reconnect** button.

Custom servers must resolve to public IP addresses. This stops the feature being used to probe services on the server's own network. Set `LINKED_ALLOW_PRIVATE_HOSTS=true` only if you link mailboxes on your LAN.

## Sign in with Microsoft (Outlook)

1. In the [Microsoft Entra admin center](https://entra.microsoft.com), go to **App registrations → New registration**.
2. **Name:** Mailed. **Supported account types:** *Accounts in any organizational directory and personal Microsoft accounts*.
3. **Redirect URI:** platform *Web*, `<APP_URL>/api/linked-accounts/oauth/callback`. For example, `http://localhost:3000/api/linked-accounts/oauth/callback` for local use, or `https://mail.example.com/api/linked-accounts/oauth/callback`.
4. Copy the **Application (client) ID** into `MICROSOFT_CLIENT_ID`.
5. Under **Certificates & secrets**, create a client secret and copy its **Value** into `MICROSOFT_CLIENT_SECRET`. Secrets expire, so note the date and renew it before then.
6. Under **API permissions**, add the delegated Microsoft Graph permissions `offline_access`, `IMAP.AccessAsUser.All` and `SMTP.Send`.
7. Restart Mailed. The Outlook option now shows **Sign in with Microsoft**.

Leave `MICROSOFT_TENANT=common` unless only accounts from one organisation should be able to link.

## Sign in with Google (optional)

App passwords are the simplest choice for Gmail. To offer *Sign in with Google* as well:

1. In the [Google Cloud console](https://console.cloud.google.com), create a project.
2. Set up the **OAuth consent screen** (External), add the scope `https://mail.google.com/`, and add the Gmail addresses that will link as **test users**.
3. Under **Credentials**, create an **OAuth client ID** of type *Web application*, with the authorised redirect URI `<APP_URL>/api/linked-accounts/oauth/callback`.
4. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart Mailed.

While the consent screen is in *Testing*, Google ends the sign-in after **7 days** and the account has to be reconnected. Publishing an app that uses the full Gmail scope requires Google's security review. For a personal installation, use app passwords instead.
