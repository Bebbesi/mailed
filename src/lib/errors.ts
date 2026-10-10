export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "bad_request", message, details);
export const unauthorized = (message = "Your session has expired. Sign in again.") =>
  new AppError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this resource.") =>
  new AppError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new AppError(404, "not_found", message);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, "conflict", message, details);
export const payloadTooLarge = (message: string) => new AppError(413, "payload_too_large", message);
export const tooManyRequests = (retryAfterSeconds: number, message = "Too many requests. Try again later.") =>
  new AppError(429, "rate_limited", message, { retryAfter: retryAfterSeconds });

/** PostgreSQL error details, also when wrapped by the ORM (DrizzleQueryError.cause). */
export function pgError(err: unknown): { code?: string; constraint?: string } {
  const e = err as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown };
  if (e && typeof e === "object" && typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
    return { code: e.code, constraint: e.constraint_name ?? e.constraint };
  }
  if (e && typeof e === "object" && e.cause) return pgError(e.cause);
  return {};
}

export const isUniqueViolation = (err: unknown) => pgError(err).code === "23505";
