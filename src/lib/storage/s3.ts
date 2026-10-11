import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../env";
import { notFound } from "../errors";
import { assertKey, contentDisposition, servedContentType, type ObjectStorage, type SignedUrlOptions } from "./shared";

/** Any S3-compatible bucket (AWS, R2, MinIO, B2…). Downloads use presigned URLs. */
export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(e: Env) {
    if (!e.S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET");
    this.bucket = e.S3_BUCKET;
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials:
        e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async put(key: string, data: Buffer | Uint8Array | string, contentType?: string): Promise<void> {
    assertKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }

  async get(key: string): Promise<Buffer> {
    assertKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) throw notFound("The stored file is no longer available.");
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if (isMissing(err)) throw notFound("The stored file is no longer available.");
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<void> {
    if (!prefix.endsWith("/")) throw new Error("Storage prefix must end with '/'");
    assertKey(prefix, { prefix: true });
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (objects.length) {
        await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects, Quiet: true } }));
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    assertKey(fromKey);
    assertKey(toKey);
    const source = `${this.bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`;
    try {
      await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, Key: toKey, CopySource: source }));
    } catch (err) {
      if (isMissing(err)) throw notFound("The stored file is no longer available.");
      throw err;
    }
  }

  async signedUrl(key: string, opts: SignedUrlOptions): Promise<string> {
    assertKey(key);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: servedContentType(opts.contentType, opts.disposition),
      ResponseContentDisposition: contentDisposition(opts.disposition, opts.filename),
      ResponseCacheControl: "private, max-age=300",
    });
    return getSignedUrl(this.client, command, { expiresIn: opts.ttlSeconds });
  }
}

function isMissing(err: unknown): boolean {
  if (err instanceof NoSuchKey) return true;
  return err instanceof S3ServiceException && (err.name === "NotFound" || err.$metadata.httpStatusCode === 404);
}
