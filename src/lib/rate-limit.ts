import { sql } from "drizzle-orm";
import { db } from "./db";
import { env } from "./env";
import { tooManyRequests } from "./errors";
import { logger } from "./logger";

export type RateLimitResult = { allowed: boolean; count: number; remaining: number; retryAfter: number };

type RedisPipeline = {
  incr(key: string): RedisPipeline;
  pttl(key: string): RedisPipeline;
  exec(): Promise<[Error | null, unknown][] | null>;
};

type RedisLike = {
  multi(): RedisPipeline;
  pexpire(key: string, ms: number): Promise<unknown>;
};

let redisClient: Promise<RedisLike | null> | null = null;

async function redis(): Promise<RedisLike | null> {
  const url = env().REDIS_URL;
  if (!url) return null;
  redisClient ??= import("ioredis")
    .then((mod) => {
      const Redis = (mod as unknown as { default: new (url: string, opts: object) => RedisLike }).default;
      return new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false });
    })
    .catch((err) => {
      logger.warn({ err }, "redis unavailable, falling back to postgres rate limiting");
      return null;
    });
  return redisClient;
}

/**
 * Fixed-window counter. Uses Redis when REDIS_URL is configured, PostgreSQL
 * otherwise, so limits hold across multiple app instances either way.
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const fullKey = `rl:${key}`;
  const client = await redis().catch(() => null);
  if (client) {
    try {
      const res = await client.multi().incr(fullKey).pttl(fullKey).exec();
      const count = Number(res?.[0]?.[1] ?? 0);
      let ttl = Number(res?.[1]?.[1] ?? -1);
      if (ttl < 0) {
        await client.pexpire(fullKey, windowSeconds * 1000);
        ttl = windowSeconds * 1000;
      }
      return {
        allowed: count <= limit,
        count,
        remaining: Math.max(0, limit - count),
        retryAfter: Math.ceil(ttl / 1000),
      };
    } catch (err) {
      logger.warn({ err }, "redis rate limit failed, using postgres");
    }
  }

  const rows = await db.execute<{ count: number; reset_at: Date }>(sql`
    insert into rate_limits (key, count, reset_at)
    values (${fullKey}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
    returning count, reset_at
  `);
  const row = rows[0];
  const count = Number(row.count);
  const resetAt = new Date(row.reset_at).getTime();
  return {
    allowed: count <= limit,
    count,
    remaining: Math.max(0, limit - count),
    retryAfter: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

/** Throws a 429 error when the limit is exceeded. */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const result = await hitRateLimit(key, limit, windowSeconds);
  if (!result.allowed) {
    throw tooManyRequests(result.retryAfter, message);
  }
  return result;
}

export async function purgeRateLimits(): Promise<void> {
  await db.execute(sql`delete from rate_limits where reset_at < now() - interval '1 hour'`);
}
