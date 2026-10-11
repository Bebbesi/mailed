import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { signToken } from "../crypto";
import { notFound } from "../errors";
import { assertKey, type ObjectStorage, type SignedUrlOptions } from "./shared";

/** Files on local disk. Downloads go through `/api/files/<signed token>`. */
export class LocalStorage implements ObjectStorage {
  private readonly root: string;

  constructor(
    dir: string,
    private readonly secret: string,
  ) {
    this.root = path.resolve(dir);
  }

  private resolve(key: string, opts: { prefix?: boolean } = {}): string {
    assertKey(key, opts);
    const file = path.resolve(this.root, ...key.split("/").filter(Boolean));
    if (!file.startsWith(this.root + path.sep)) throw new Error("Storage key escapes the storage root");
    return file;
  }

  async put(key: string, data: Buffer | Uint8Array | string): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    // Write then rename so readers never see a partially written file.
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, data);
      await rename(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw notFound("The stored file is no longer available.");
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    if (!prefix.endsWith("/")) throw new Error("Storage prefix must end with '/'");
    await rm(this.resolve(prefix, { prefix: true }), { recursive: true, force: true });
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const to = this.resolve(toKey);
    await mkdir(path.dirname(to), { recursive: true });
    try {
      await copyFile(this.resolve(fromKey), to);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw notFound("The stored file is no longer available.");
      throw err;
    }
  }

  async signedUrl(key: string, opts: SignedUrlOptions): Promise<string> {
    assertKey(key);
    const payload = JSON.stringify({ k: key, f: opts.filename, t: opts.contentType, d: opts.disposition });
    return `/api/files/${signToken(this.secret, payload, opts.ttlSeconds)}`;
  }
}
