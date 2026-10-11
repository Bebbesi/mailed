/** Types and key/header helpers shared by the storage drivers. */

export type Disposition = "inline" | "attachment";

export type SignedUrlOptions = {
  filename: string;
  contentType: string;
  disposition: Disposition;
  ttlSeconds: number;
};

/** Object storage for raw messages, attachments, avatars and pending imports. */
export interface ObjectStorage {
  put(key: string, data: Buffer | Uint8Array | string, contentType?: string): Promise<void>;
  /** Throws a 404 AppError when the object does not exist. */
  get(key: string): Promise<Buffer>;
  /** Succeeds when the object is already gone. */
  delete(key: string): Promise<void>;
  /** Removes every object under a prefix ending in `/`. */
  deletePrefix(prefix: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  /** Short-lived download URL. Call only after authorising access to `key`. */
  signedUrl(key: string, opts: SignedUrlOptions): Promise<string>;
}

const KEY = /^[\w.-]+(\/[\w.-]+)*$/;

/** Rejects keys that could escape the storage root or address another tenant's objects. */
export function assertKey(key: string, opts: { prefix?: boolean } = {}): void {
  const body = opts.prefix && key.endsWith("/") ? key.slice(0, -1) : key;
  if (!KEY.test(body) || body.split("/").some((s) => s === "." || s === "..")) {
    throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
  }
}

const SAFE_INLINE = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;

/** Only images may be served inline; everything else downloads as an opaque file. */
export function servedContentType(contentType: string, disposition: Disposition): string {
  return disposition === "inline" && SAFE_INLINE.test(contentType) ? contentType : "application/octet-stream";
}

/** RFC 6266 header value with an ASCII fallback and an RFC 5987 UTF-8 filename. */
export function contentDisposition(type: Disposition, filename: string): string {
  const name = filename.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim() || "file";
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
