import { eq } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { db } from "@/lib/db";
import { imapSyncState } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ingestRawMessage, IngestError } from "@/lib/mail/ingest";

/**
 * Polls a provider mailbox (typically a catch-all for the hosted domains) and
 * imports new messages by UID. Progress is stored after every message, so a
 * crash or network error resumes where it stopped; re-imports are deduplicated.
 */
export function startImapPoller() {
  const e = env();
  if (!e.IMAP_HOST || !e.IMAP_USER) {
    logger.error("IMAP_ENABLED is true but IMAP_HOST/IMAP_USER are missing");
    return { stop: async () => {} };
  }
  const stateId = `${e.IMAP_HOST}|${e.IMAP_USER}|${e.IMAP_MAILBOX}`;
  let stopped = false;
  let running = false;
  let client: ImapFlow | null = null;
  let timer: NodeJS.Timeout | null = null;
  let failures = 0;

  const connect = async () => {
    const c = new ImapFlow({
      host: e.IMAP_HOST!,
      port: e.IMAP_PORT,
      secure: e.IMAP_SECURE,
      auth: { user: e.IMAP_USER!, pass: e.IMAP_PASSWORD ?? "" },
      logger: false,
      emitLogs: false,
    });
    c.on("error", (err) => logger.warn({ err: err.message }, "imap connection error"));
    c.on("close", () => {
      if (client === c) client = null;
    });
    c.on("exists", () => void sync());
    await c.connect();
    return c;
  };

  const sync = async () => {
    if (running || stopped) return;
    running = true;
    try {
      client ??= await connect();
      const lock = await client.getMailboxLock(e.IMAP_MAILBOX);
      try {
        const mailbox = client.mailbox;
        const uidValidity = mailbox ? String(mailbox.uidValidity) : null;
        const [state] = await db.select().from(imapSyncState).where(eq(imapSyncState.id, stateId)).limit(1);
        let lastUid = state && state.uidValidity === uidValidity ? state.lastUid : 0;
        if (!state) await db.insert(imapSyncState).values({ id: stateId, uidValidity, lastUid: 0 }).onConflictDoNothing();
        else if (state.uidValidity !== uidValidity) {
          logger.warn({ stateId }, "IMAP UIDVALIDITY changed; resynchronising (duplicates are skipped)");
        }

        let processed = 0;
        for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
          if (msg.uid <= lastUid || !msg.source) continue;
          try {
            await ingestRawMessage(msg.source, { source: "imap" });
          } catch (err) {
            if (!(err instanceof IngestError)) throw err;
            logger.warn({ uid: msg.uid, code: err.code }, "IMAP message skipped");
          }
          lastUid = msg.uid;
          processed++;
          await db
            .update(imapSyncState)
            .set({ lastUid, uidValidity, lastSyncAt: new Date(), lastError: null, consecutiveFailures: 0 })
            .where(eq(imapSyncState.id, stateId));
          if (e.IMAP_PROCESSED_MAILBOX) {
            await client.messageMove(String(msg.uid), e.IMAP_PROCESSED_MAILBOX, { uid: true }).catch((err) =>
              logger.warn({ err: err.message }, "could not move processed IMAP message"),
            );
          }
        }
        await db.update(imapSyncState).set({ lastSyncAt: new Date() }).where(eq(imapSyncState.id, stateId));
        if (processed) logger.info({ processed }, "IMAP sync imported messages");
        failures = 0;
      } finally {
        lock.release();
      }
    } catch (err) {
      failures++;
      logger.error({ err: (err as Error).message, failures }, "IMAP sync failed");
      await db
        .update(imapSyncState)
        .set({ lastError: (err as Error).message.slice(0, 500), consecutiveFailures: failures })
        .where(eq(imapSyncState.id, stateId))
        .catch(() => undefined);
      await client?.logout().catch(() => undefined);
      client = null;
    } finally {
      running = false;
    }
  };

  const schedule = () => {
    if (stopped) return;
    const backoff = failures ? Math.min(15 * 60, e.IMAP_POLL_INTERVAL_SECONDS * 2 ** Math.min(failures, 5)) : e.IMAP_POLL_INTERVAL_SECONDS;
    timer = setTimeout(async () => {
      await sync();
      schedule();
    }, backoff * 1000);
  };

  void sync().then(schedule);
  logger.info({ host: e.IMAP_HOST, mailbox: e.IMAP_MAILBOX }, "IMAP poller started");

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await client?.logout().catch(() => undefined);
    },
  };
}
