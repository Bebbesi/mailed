import { and, eq, sql } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { db } from "../db";
import { attachments, messages } from "../db/schema";
import { env } from "../env";
import { AppError, badRequest, forbidden, notFound, payloadTooLarge } from "../errors";
import { sha256Hex } from "../crypto";
import { isDangerousFilename } from "../classify/signals";
import { mailboxUsage } from "../mail/ingest";
import { storage, userPrefix } from "../storage";
import type { AttachmentDTO } from "../types";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
  return cleaned || "file";
}

function looksExecutable(buf: Buffer) {
  return (
    (buf[0] === 0x4d && buf[1] === 0x5a) ||
    (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) ||
    (buf[0] === 0xcf && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe) ||
    (buf[0] === 0x23 && buf[1] === 0x21) // "#!" script
  );
}

/**
 * Validates and stores a file attached to a draft. Executables and scripts are
 * refused by extension and by content signature, regardless of the claimed type.
 */
export async function addDraftAttachment(userId: string, draftId: string, file: { name: string; type: string; data: Buffer }): Promise<AttachmentDTO> {
  const [draft] = await db
    .select({ id: messages.id, folder: messages.folder, sendStatus: messages.sendStatus })
    .from(messages)
    .where(and(eq(messages.id, draftId), eq(messages.userId, userId)))
    .limit(1);
  if (!draft) throw notFound("Draft not found.");
  if (draft.folder !== "drafts" || draft.sendStatus !== "draft") throw new AppError(409, "not_editable", "This message can no longer be edited.");

  if (file.data.length === 0) throw badRequest("The file is empty.");
  if (file.data.length > MAX_FILE_BYTES) throw payloadTooLarge(`Files can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB.`);

  const filename = sanitizeFilename(file.name);
  if (isDangerousFilename(filename) || looksExecutable(file.data)) {
    throw forbidden(`"${filename}" is blocked because this type of file can contain harmful software.`);
  }

  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::int` })
    .from(attachments)
    .where(and(eq(attachments.userId, userId), eq(attachments.messageId, draftId)));
  const limit = env().MAX_MESSAGE_SIZE_MB * 1024 * 1024;
  if (total + file.data.length > limit) throw payloadTooLarge(`Attachments can total at most ${env().MAX_MESSAGE_SIZE_MB} MB per message.`);

  const [{ quotaBytes }] = await db.execute<{ quotaBytes: number }>(sql`select quota_bytes as "quotaBytes" from users where id = ${userId}`);
  if ((await mailboxUsage(userId)) + file.data.length > Number(quotaBytes)) throw new AppError(507, "over_quota", "Your storage is full.");

  const detected = await fileTypeFromBuffer(file.data).catch(() => undefined);
  if (detected && ["exe", "elf", "mach", "msi", "dmg"].includes(detected.ext)) {
    throw forbidden(`"${filename}" is blocked because this type of file can contain harmful software.`);
  }
  const contentType = (detected?.mime ?? (file.type && /^[\w.+-]+\/[\w.+-]+$/.test(file.type) ? file.type : "application/octet-stream")).toLowerCase();
  const id = crypto.randomUUID();
  const key = `${userPrefix(userId)}att/${id}`;
  await storage().put(key, file.data, contentType);
  await db.insert(attachments).values({
    id,
    userId,
    messageId: draftId,
    filename,
    contentType,
    sizeBytes: file.data.length,
    storageKey: key,
    sha256: sha256Hex(file.data),
  });
  await db.update(messages).set({ hasAttachments: true, updatedAt: new Date() }).where(eq(messages.id, draftId));
  return { id, filename, contentType, size: file.data.length, isInline: false, isDangerous: false };
}

export async function removeDraftAttachment(userId: string, attachmentId: string) {
  const [row] = await db
    .select({ att: attachments, folder: messages.folder, sendStatus: messages.sendStatus })
    .from(attachments)
    .innerJoin(messages, eq(messages.id, attachments.messageId))
    .where(and(eq(attachments.id, attachmentId), eq(attachments.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Attachment not found.");
  if (row.folder !== "drafts" || row.sendStatus !== "draft") throw new AppError(409, "not_editable", "This message can no longer be edited.");
  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  await storage().delete(row.att.storageKey).catch(() => undefined);
  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(attachments)
    .where(eq(attachments.messageId, row.att.messageId!));
  if (remaining === 0) await db.update(messages).set({ hasAttachments: false }).where(eq(messages.id, row.att.messageId!));
}

/** Authorises a download and returns a short-lived URL. */
export async function attachmentDownloadUrl(userId: string, attachmentId: string, opts: { allowRisky?: boolean } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) throw notFound("Attachment not found.");
  const [row] = await db
    .select({ att: attachments, folder: messages.folder, suspicious: messages.isSuspicious })
    .from(attachments)
    .leftJoin(messages, eq(messages.id, attachments.messageId))
    .where(and(eq(attachments.id, attachmentId), eq(attachments.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Attachment not found.");
  if (row.att.isDangerous) throw forbidden("This attachment is blocked because it may contain harmful software.");
  if ((row.folder === "spam" || row.suspicious) && !opts.allowRisky) {
    throw new AppError(409, "confirmation_required", "This attachment comes from a suspicious message. Confirm to download it.");
  }
  const url = await storage().signedUrl(row.att.storageKey, {
    filename: row.att.filename,
    contentType: row.att.contentType,
    disposition: "attachment",
    ttlSeconds: 120,
  });
  return { url, filename: row.att.filename };
}
