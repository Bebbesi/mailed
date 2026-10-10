import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, type DbOrTx } from "./db";
import { jobs, type Job } from "./db/schema";
import { logger } from "./logger";

export const JOBS_CHANNEL = "mailed_jobs";

export type JobType = "send_message" | "import_mailbox";

export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

/** Retry delays: 1m, 5m, 15m, 1h, 3h, 6h. */
const BACKOFF_SECONDS = [60, 300, 900, 3600, 10800, 21600];

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options: { runAt?: Date; uniqueKey?: string; maxAttempts?: number } = {},
  conn: DbOrTx = db,
): Promise<Job | null> {
  const [job] = await conn
    .insert(jobs)
    .values({
      type,
      payload,
      runAt: options.runAt ?? new Date(),
      uniqueKey: options.uniqueKey ?? null,
      maxAttempts: options.maxAttempts ?? 6,
    })
    .onConflictDoNothing()
    .returning();
  await conn.execute(sql`select pg_notify(${JOBS_CHANNEL}, ${type})`);
  return job ?? null;
}

/** Removes a pending job; returns false if a worker already picked it up. */
export async function cancelPendingJob(uniqueKey: string, conn: DbOrTx = db): Promise<boolean> {
  const deleted = await conn
    .delete(jobs)
    .where(and(eq(jobs.uniqueKey, uniqueKey), eq(jobs.status, "pending")))
    .returning({ id: jobs.id });
  return deleted.length > 0;
}

/** Claims due jobs with SKIP LOCKED so several workers can run safely. */
export async function claimJobs(workerId: string, limit = 5): Promise<Job[]> {
  const rows = await db.execute<{ id: string }>(sql`
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId},
      attempts = attempts + 1, updated_at = now()
    where id in (
      select id from jobs
      where status = 'pending' and run_at <= now()
      order by run_at
      for update skip locked
      limit ${limit}
    )
    returning id
  `);
  if (rows.length === 0) return [];
  return db.select().from(jobs).where(inArray(jobs.id, rows.map((r) => r.id)));
}

export async function completeJob(id: string) {
  await db.update(jobs).set({ status: "completed", completedAt: new Date(), lockedAt: null, updatedAt: new Date() }).where(eq(jobs.id, id));
}

/** Records a failure; schedules a retry unless the error is permanent or attempts are exhausted. */
export async function failJob(job: Job, error: unknown): Promise<{ willRetry: boolean }> {
  const message = (error as Error)?.message?.slice(0, 2000) ?? String(error);
  const permanent = error instanceof PermanentJobError;
  const willRetry = !permanent && job.attempts < job.maxAttempts;
  const delay = BACKOFF_SECONDS[Math.min(job.attempts - 1, BACKOFF_SECONDS.length - 1)] ?? 3600;
  await db
    .update(jobs)
    .set({
      status: willRetry ? "pending" : "failed",
      lastError: message,
      runAt: willRetry ? new Date(Date.now() + delay * 1000) : job.runAt,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));
  logger.warn({ jobId: job.id, type: job.type, attempts: job.attempts, willRetry, error: message }, "job failed");
  return { willRetry };
}

/** Returns jobs stuck in "running" (e.g. a crashed worker) to the queue. */
export async function recoverStaleJobs(olderThanMinutes = 10) {
  await db
    .update(jobs)
    .set({ status: "pending", lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, new Date(Date.now() - olderThanMinutes * 60_000))));
}

export async function purgeOldJobs(days = 14) {
  await db
    .delete(jobs)
    .where(and(inArray(jobs.status, ["completed", "failed"]), lt(jobs.updatedAt, new Date(Date.now() - days * 86400_000))));
}
