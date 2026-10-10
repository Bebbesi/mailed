"use client";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** Field name for validation errors returned by the server, if any. */
  get field(): string | undefined {
    const d = this.details as { field?: string } | Array<{ path: string }> | undefined;
    if (Array.isArray(d)) return d[0]?.path;
    return d?.field;
  }
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export const UNAUTHORIZED_EVENT = "mailed:unauthorized";

/** Fetch wrapper: JSON in/out, typed errors, and session-expiry handling. */
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: isForm || opts.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network", "Can't reach Mailed. Check your connection and try again.");
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? `Request failed (${res.status}).`, e?.details);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

/** Upload with progress (fetch has no upload progress events). */
export function uploadWithProgress<T>(url: string, form: FormData, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else {
        if (xhr.status === 401) window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
        const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
        reject(new ApiError(xhr.status, e?.code ?? "error", e?.message ?? `Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "network", "Upload failed. Check your connection."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
