process.env.MAILED_SERVICE ??= "worker";

import os from "node:os";

async function main() {
  const { env } = await import("@/lib/env");
  const { logger } = await import("@/lib/logger");
  const { sqlClient, closeDb } = await import("@/lib/db");
  const { claimJobs, completeJob, failJob, JOBS_CHANNEL } = await import("@/lib/jobs");
  const { processSendJob, finalizeFailedSend } = await import("@/lib/services/send");
  const { runImport } = await import("@/lib/services/data-transfer");
  const { wakeSnoozed, fireReminders, purgeRetention, housekeeping } = await import("@/lib/services/maintenance");
  const { startSmtpServer } = await import("./smtp-server");
  const { startImapPoller } = await import("./imap");
  const { runDueLinkedSyncs } = await import("@/lib/linked/sync");

  const config = env();
  const workerId = `${os.hostname()}:${process.pid}`;
  let stopping = false;
  let wake: (() => void) | null = null;

  const handlers: Record<string, (payload: Record<string, unknown>, attempt: number, max: number) => Promise<void>> = {
    send_message: (p, attempt, max) => processSendJob(p as { messageId?: string }, attempt, max),
    import_mailbox: async (p) => {
      await runImport(String(p.userId), String(p.key), p.folder === "archive" ? "archive" : "inbox");
    },
  };

  async function runJobs() {
    while (!stopping) {
      let jobs: Awaited<ReturnType<typeof claimJobs>> = [];
      try {
        jobs = await claimJobs(workerId, 5);
      } catch (err) {
        logger.error({ err }, "failed to claim jobs");
      }
      await Promise.all(
        jobs.map(async (job) => {
          const handler = handlers[job.type];
          try {
            if (!handler) throw new Error(`No handler for job type ${job.type}`);
            await handler(job.payload, job.attempts, job.maxAttempts);
            await completeJob(job.id);
          } catch (err) {
            const { willRetry } = await failJob(job, err);
            if (!willRetry && job.type === "send_message") {
              await finalizeFailedSend(job.payload as { messageId?: string }, (err as Error).message).catch((e) =>
                logger.error({ err: e }, "failed to finalise send failure"),
              );
            }
          }
        }),
      );
      if (jobs.length === 0) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 2000);
          wake = () => {
            clearTimeout(t);
            resolve();
          };
        });
        wake = null;
      }
    }
  }

  const listener = await sqlClient().listen(JOBS_CHANNEL, () => wake?.());

  const every = (ms: number, name: string, fn: () => Promise<void>) => {
    let busy = false;
    const tick = async () => {
      if (busy || stopping) return;
      busy = true;
      try {
        await fn();
      } catch (err) {
        logger.error({ err, task: name }, "periodic task failed");
      } finally {
        busy = false;
      }
    };
    void tick();
    return setInterval(tick, ms);
  };

  const timers = [
    every(15_000, "snooze", wakeSnoozed),
    every(15_000, "reminders", fireReminders),
    every(10 * 60_000, "retention", purgeRetention),
    every(10 * 60_000, "housekeeping", housekeeping),
    every(15_000, "linked-accounts", () => runDueLinkedSyncs()),
  ];

  const smtp = config.INBOUND_SMTP_ENABLED ? startSmtpServer() : null;
  const imap = config.IMAP_ENABLED ? startImapPoller() : null;

  logger.info(
    {
      workerId,
      outbound: config.MAIL_OUTBOUND_DRIVER,
      inboundSmtp: config.INBOUND_SMTP_ENABLED,
      imap: config.IMAP_ENABLED,
      storage: config.STORAGE_DRIVER,
    },
    "worker started",
  );

  const jobLoop = runJobs();

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "worker shutting down");
    wake?.();
    timers.forEach(clearInterval);
    await Promise.allSettled([
      new Promise<void>((resolve) => (smtp ? smtp.close(() => resolve()) : resolve())),
      imap?.stop(),
      listener.unlisten(),
      jobLoop,
    ]);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
