import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { linkedAccounts, type LinkedAccount } from "../db/schema";
import { env } from "../env";
import { publishUserEvent } from "../events";
import { logger } from "../logger";
import { ingestRawMessage, IngestError } from "../mail/ingest";
import { createNotification } from "../services/notifications";
import { connectionSettings, forgetAccessToken, linkedConnector, LinkedAuthError, type LinkedMailbox } from "./connect";

/** At most this many new messages per run; the rest follow on the next run. */
const BATCH = 200;
const LOCK_MINUTES = 10;

/**
 * Claims accounts that are due and not being synced elsewhere, so several
 * workers can run without fetching the same mailbox twice.
 */
async function claimDue(limit: number): Promise<LinkedAccount[]> {
  const rows = await db.execute<{ id: string }>(sql`
    update linked_accounts set sync_locked_until = now() + make_interval(mins => ${LOCK_MINUTES})
    where id in (
      select id from linked_accounts
      where sync_enabled and status <> 'auth_error' and next_sync_at <= now()
        and (sync_locked_until is null or sync_locked_until < now())
      order by next_sync_at
      for update skip locked
      limit ${limit}
    )
    returning id
  `);
  if (rows.length === 0) return [];
  return Promise.all(rows.map(async (r) => (await db.select().from(linkedAccounts).where(eq(linkedAccounts.id, r.id)).limit(1))[0])).then((a) =>
    a.filter((x): x is LinkedAccount => Boolean(x)),
  );
}

/** Runs due syncs; called periodically by the worker. */
export async function runDueLinkedSyncs(limit = 3) {
  const due = await claimDue(limit);
  await Promise.all(due.map((a) => syncLinkedAccount(a).catch((err) => logger.error({ err, accountId: a.id }, "linked sync crashed"))));
}

async function importOne(a: LinkedAccount, uid: number, msg: { source: Buffer; seen: boolean; internalDate: Date | null }, backfill: boolean) {
  try {
    await ingestRawMessage(msg.source, {
      source: "linked",
      targetUserIds: [a.userId],
      receivedAt: msg.internalDate ?? undefined,
      linked: { accountId: a.id, address: a.email.toLowerCase(), labelId: a.labelId, seen: msg.seen, backfill },
    });
  } catch (err) {
    if (!(err instanceof IngestError)) throw err;
    logger.warn({ accountId: a.id, uid, code: err.code }, "linked message skipped");
  }
  await db.update(linkedAccounts).set({ lastUid: uid }).where(eq(linkedAccounts.id, a.id));
}

/**
 * Fetches new mail from one account's INBOX. The first run (or a UIDVALIDITY
 * change) imports recent history quietly; later runs fetch by UID. Progress is
 * saved after every message and re-imports are deduplicated by Message-ID.
 */
export async function syncLinkedAccount(a: LinkedAccount): Promise<{ imported: number }> {
  const interval = env().LINKED_POLL_INTERVAL_SECONDS;
  let imported = 0;
  let mailbox: LinkedMailbox | null = null;
  try {
    const settings = await connectionSettings(a);
    mailbox = await linkedConnector().openInbox(settings);

    let { lastUid, backfillDone } = a;
    if (a.uidValidity !== mailbox.uidValidity) {
      if (a.uidValidity) logger.warn({ accountId: a.id }, "linked account UIDVALIDITY changed; re-importing recent mail");
      lastUid = 0;
      backfillDone = false;
      await db.update(linkedAccounts).set({ uidValidity: mailbox.uidValidity, lastUid: 0, backfillDone: false }).where(eq(linkedAccounts.id, a.id));
    }

    if (!backfillDone) {
      const since = new Date(Date.now() - env().LINKED_BACKFILL_DAYS * 86400_000);
      const uids = (await mailbox.searchSince(since)).filter((u) => u > lastUid).slice(-env().LINKED_BACKFILL_MAX);
      for await (const msg of mailbox.fetch(uids)) {
        await importOne(a, msg.uid, msg, true);
        lastUid = Math.max(lastUid, msg.uid);
        imported++;
      }
      // Everything older than the window is skipped; mail arriving from now on is new.
      lastUid = Math.max(lastUid, mailbox.uidNext - 1);
      await db.update(linkedAccounts).set({ lastUid, backfillDone: true }).where(eq(linkedAccounts.id, a.id));
      if (imported) await publishUserEvent(a.userId, { type: "mail.changed" });
    } else {
      for await (const msg of mailbox.fetch({ from: lastUid + 1 })) {
        // "N:*" returns the newest message even when N is past the end.
        if (msg.uid <= lastUid) continue;
        await importOne(a, msg.uid, msg, false);
        lastUid = msg.uid;
        if (++imported >= BATCH) break;
      }
    }

    await db
      .update(linkedAccounts)
      .set({
        status: "active",
        lastError: null,
        consecutiveFailures: 0,
        lastSyncAt: new Date(),
        nextSyncAt: new Date(Date.now() + (imported >= BATCH ? 5 : interval) * 1000),
        syncLockedUntil: null,
      })
      .where(eq(linkedAccounts.id, a.id));
    if (imported) logger.info({ accountId: a.id, imported }, "linked account synced");
    return { imported };
  } catch (err) {
    await recordFailure(a, err);
    return { imported };
  } finally {
    await mailbox?.close().catch(() => undefined);
  }
}

async function recordFailure(a: LinkedAccount, err: unknown) {
  const message = ((err as Error)?.message ?? String(err)).slice(0, 500);
  if (err instanceof LinkedAuthError) {
    // Stop until the user reconnects: repeated bad logins can get the account locked.
    forgetAccessToken(a.id);
    const [updated] = await db
      .update(linkedAccounts)
      .set({ status: "auth_error", lastError: message, nextSyncAt: null, syncLockedUntil: null, updatedAt: new Date() })
      .where(and(eq(linkedAccounts.id, a.id), sql`${linkedAccounts.status} <> 'auth_error'`))
      .returning({ id: linkedAccounts.id });
    if (updated) {
      await createNotification(a.userId, {
        type: "system",
        title: `Reconnect ${a.email}`,
        body: `Mailed can no longer sign in to ${a.email}: ${message} Open Settings → Accounts to fix it.`.slice(0, 500),
      });
    }
    logger.warn({ accountId: a.id }, "linked account credentials rejected; sync paused");
    return;
  }
  const failures = a.consecutiveFailures + 1;
  const delay = Math.min(3600, env().LINKED_POLL_INTERVAL_SECONDS * 2 ** Math.min(failures, 6));
  await db
    .update(linkedAccounts)
    .set({ status: "error", lastError: message, consecutiveFailures: failures, nextSyncAt: new Date(Date.now() + delay * 1000), syncLockedUntil: null })
    .where(eq(linkedAccounts.id, a.id));
  logger.warn({ accountId: a.id, failures, err: message }, "linked account sync failed");
}
