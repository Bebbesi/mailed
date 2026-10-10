import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { getCurrentSession } from "../auth/session";
import type { SessionRecord, SessionUser, ValidatedSession } from "../auth/session-core";
import { AppError, badRequest, forbidden, payloadTooLarge, unauthorized } from "../errors";
import { logger } from "../logger";
import { clientIp, userAgent } from "../request";
import { env } from "../env";

type Params = Record<string, string | string[]>;
type RouteContext<P> = { params: Promise<P> };

type BaseContext<P> = {
  req: NextRequest;
  params: P;
  ip: string;
  userAgent: string;
};

export type AuthedContext<P = Params> = BaseContext<P> & {
  user: SessionUser;
  session: SessionRecord;
};

export type PublicContext<P = Params> = BaseContext<P> & {
  auth: ValidatedSession | null;
};

type Result = Response | Record<string, unknown> | unknown[] | void;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated endpoints: state-changing requests must
 * come from our own origin. Browsers always send Origin on cross-site POSTs.
 */
export function verifyOrigin(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) {
    return req.headers.get("sec-fetch-site") === "same-origin";
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(env().APP_URL).host);
  } catch {
    /* ignore */
  }
  const host = env().TRUST_PROXY ? (req.headers.get("x-forwarded-host") ?? req.headers.get("host")) : req.headers.get("host");
  if (host) allowed.add(host);
  return allowed.has(originHost);
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    if (err.status === 429 && err.details && typeof err.details === "object" && "retryAfter" in err.details) {
      headers["Retry-After"] = String((err.details as { retryAfter: number }).retryAfter);
    }
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details ?? null } },
      { status: err.status, headers },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: err.issues[0]?.message ?? "Invalid request.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }
  logger.error({ err }, "unhandled API error");
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

function toResponse(result: Result): Response {
  if (result instanceof Response) return result;
  return NextResponse.json(result ?? { ok: true });
}

/** Route handler that requires a valid session and same-origin requests. */
export function authed<P = Params>(fn: (ctx: AuthedContext<P>) => Promise<Result>) {
  return async (req: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      if (!verifyOrigin(req)) throw forbidden("Cross-origin request blocked.");
      const current = await getCurrentSession();
      if (!current) throw unauthorized();
      const params = (await context?.params) ?? ({} as P);
      return toResponse(
        await fn({
          req,
          params,
          user: current.user,
          session: current.session,
          ip: clientIp(req.headers),
          userAgent: userAgent(req.headers),
        }),
      );
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Route handler without a session requirement (auth forms). Same-origin is still enforced. */
export function publicRoute<P = Params>(
  fn: (ctx: PublicContext<P>) => Promise<Result>,
  options: { skipOriginCheck?: boolean } = {},
) {
  return async (req: NextRequest, context: RouteContext<P>): Promise<Response> => {
    try {
      if (!options.skipOriginCheck && !verifyOrigin(req)) throw forbidden("Cross-origin request blocked.");
      const params = (await context?.params) ?? ({} as P);
      const auth = options.skipOriginCheck ? null : await getCurrentSession();
      return toResponse(
        await fn({ req, params, auth, ip: clientIp(req.headers), userAgent: userAgent(req.headers) }),
      );
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson<S extends z.ZodType>(req: NextRequest, schema: S, maxBytes = 2_000_000): Promise<z.infer<S>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw badRequest("Expected a JSON body.");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw payloadTooLarge("Request body is too large.");
  let data: unknown;
  try {
    data = text.length ? JSON.parse(text) : {};
  } catch {
    throw badRequest("Malformed JSON body.");
  }
  return schema.parse(data);
}

export function readQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  return schema.parse(obj);
}
