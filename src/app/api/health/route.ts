import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Reports which mail paths are configured, without secrets. */
export async function GET() {
  let database = "ok";
  let worker: string = "unknown";
  try {
    await db.execute(sql`select 1`);
    const [row] = await db.execute<{ stale: number }>(sql`
      select count(*)::int as stale from jobs where status = 'pending' and run_at < now() - interval '5 minutes'
    `);
    worker = row.stale > 0 ? "backlog" : "ok";
  } catch {
    database = "error";
  }
  return NextResponse.json(
    { status: database === "ok" ? "ok" : "degraded", database, worker },
    { status: database === "ok" ? 200 : 503 },
  );
}
