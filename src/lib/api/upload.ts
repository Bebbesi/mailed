import type { NextRequest } from "next/server";
import { badRequest, payloadTooLarge } from "../errors";

/** Reads one file from a multipart request after checking the declared size. */
export async function readUpload(req: NextRequest, field: string, maxBytes: number) {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(declared)) throw badRequest("Missing Content-Length.");
  if (declared > maxBytes + 64 * 1024) throw payloadTooLarge(`The file is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected a multipart upload.");
  }
  const file = form.get(field);
  if (!file || typeof file === "string") throw badRequest("No file was uploaded.");
  if (file.size > maxBytes) throw payloadTooLarge(`The file is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  const data = Buffer.from(await file.arrayBuffer());
  return { name: file.name || "file", type: file.type || "application/octet-stream", data, form };
}
