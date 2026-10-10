"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Maximize2, Minus, Paperclip, Send, Trash2, X, FileWarning } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { api, ApiError, errorMessage, uploadWithProgress } from "@/lib/client/api";
import { formatBytes } from "@/lib/client/format";
import { qk } from "@/lib/client/hooks";
import { cn } from "@/lib/cn";
import type { AddressDTO, AttachmentDTO, MessageDTO } from "@/lib/types";
import { useApp, type ComposeRequest } from "../app-context";
import { EmailFrame } from "../email-frame";
import { MailEditorContent, Toolbar, useMailEditor } from "./editor";
import { isValidAddress, RecipientInput } from "./recipient-input";
import { ScheduleMenu } from "./schedule-menu";

type DraftResponse = MessageDTO & { quotedHtml: string | null };
type SaveState = "idle" | "saving" | "saved" | "error";
type Upload = { key: string; name: string; size: number; progress: number; error?: string; controller: AbortController };

export type ComposerVariant = "floating" | "inline" | "page";

const MAX_FILE = 20 * 1024 * 1024;

function signatureHtml(sig: string) {
  return sig.trim() ? `<p></p><p>-- </p>${sig}` : "";
}

export function Composer({
  request,
  variant,
  onClose,
  onMinimize,
  minimized,
  onExpand,
  onSent,
}: {
  request: ComposeRequest;
  variant: ComposerVariant;
  onClose: () => void;
  onMinimize?: () => void;
  minimized?: boolean;
  onExpand?: (draftId: string) => void;
  onSent?: () => void;
}) {
  const { settings, prefs, openCompose, me } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(Boolean(request.draftId || (request.mode && request.mode !== "new")));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(request.draftId ?? null);
  const [to, setTo] = useState<AddressDTO[]>(request.to ?? []);
  const [cc, setCc] = useState<AddressDTO[]>([]);
  const [bcc, setBcc] = useState<AddressDTO[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [initialHtml, setInitialHtml] = useState<string | null>(request.draftId || (request.mode && request.mode !== "new") ? null : `<p></p>${signatureHtml(settings.signatureHtml)}`);
  const [quotedHtml, setQuotedHtml] = useState<string | null>(null);
  const [showQuoted, setShowQuoted] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDTO[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const htmlRef = useRef<string>(initialHtml ?? "");
  const lastSavedKey = useRef<string>(JSON.stringify({ to: request.to ?? [], cc: [], bcc: [], subject: "", html: initialHtml ?? "" }));
  const dirtyRef = useRef(false);
  const draftIdRef = useRef<string | null>(draftId);
  const savingRef = useRef<Promise<string | null> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef({ to, cc, bcc, subject });
  useEffect(() => {
    stateRef.current = { to, cc, bcc, subject };
  }, [to, cc, bcc, subject]);

  const skipSaveRef = useRef(false);
  const applyDraft = useCallback((d: DraftResponse) => {
    skipSaveRef.current = true;
    setDraftId(d.id);
    draftIdRef.current = d.id;
    setTo(d.to);
    setCc(d.cc);
    setBcc(d.bcc);
    setShowCc(d.cc.length > 0);
    setShowBcc(d.bcc.length > 0);
    setSubject(d.subject);
    setInitialHtml(d.html ?? "<p></p>");
    htmlRef.current = d.html ?? "<p></p>";
    lastSavedKey.current = JSON.stringify({ to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, html: d.html ?? "<p></p>" });
    setQuotedHtml(d.quotedHtml);
    setAttachments(d.attachments.filter((a) => !a.isInline));
  }, []);

  // Load an existing draft, or create a reply/forward pre-filled by the server.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (request.draftId) {
          const d = await api<DraftResponse>(`/api/drafts/${request.draftId}`);
          if (!cancelled) applyDraft(d);
        } else if (request.mode && request.mode !== "new" && request.sourceMessageId) {
          const d = await api<DraftResponse>("/api/drafts", { body: { mode: request.mode, sourceMessageId: request.sourceMessageId } });
          if (!cancelled) {
            applyDraft(d);
            setSaveState("saved");
            setSavedAt(new Date());
            void qc.invalidateQueries({ queryKey: qk.counts });
          }
        }
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Saves the current content; creates the draft on first save. */
  const save = useCallback(async (): Promise<string | null> => {
    if (savingRef.current) await savingRef.current;
    if (!dirtyRef.current && draftIdRef.current) return draftIdRef.current;
    const body = { ...stateRef.current, html: htmlRef.current };
    const key = JSON.stringify(body);
    if (key === lastSavedKey.current) {
      dirtyRef.current = false;
      return draftIdRef.current;
    }
    dirtyRef.current = false;
    setSaveState("saving");
    const run = (async () => {
      try {
        if (draftIdRef.current) {
          await api(`/api/drafts/${draftIdRef.current}`, { method: "PATCH", body });
        } else {
          const d = await api<DraftResponse>("/api/drafts", { body: { mode: "new", ...body } });
          draftIdRef.current = d.id;
          setDraftId(d.id);
          void qc.invalidateQueries({ queryKey: qk.counts });
        }
        lastSavedKey.current = key;
        setSaveState("saved");
        setSavedAt(new Date());
        return draftIdRef.current;
      } catch (err) {
        dirtyRef.current = true;
        setSaveState("error");
        if (err instanceof ApiError && err.code === "not_editable") throw err;
        return draftIdRef.current;
      }
    })();
    savingRef.current = run;
    try {
      return await run;
    } finally {
      savingRef.current = null;
    }
  }, [qc]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setSaveState((s) => (s === "saving" ? s : "idle"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save().catch(() => undefined), 1200);
  }, [save]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current || loading || skipSaveRef.current) {
      firstRender.current = false;
      skipSaveRef.current = false;
      return;
    }
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || savingRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const sendRef = useRef<(at?: Date) => void>(() => undefined);
  const editor = useMailEditor({
    initialHtml: initialHtml ?? "",
    autofocus: variant !== "floating" || (request.mode !== undefined && request.mode !== "new"),
    onChange: (html) => {
      htmlRef.current = html;
      scheduleSave();
    },
    onSubmitShortcut: () => sendRef.current(),
  });

  // Content arrives after the editor exists when loading a draft or reply.
  useEffect(() => {
    if (editor && initialHtml !== null && editor.getHTML() !== initialHtml) {
      editor.commands.setContent(initialHtml, { emitUpdate: false });
      htmlRef.current = editor.getHTML();
      lastSavedKey.current = JSON.stringify({ ...JSON.parse(lastSavedKey.current), html: htmlRef.current });
      if (request.mode && request.mode !== "new") editor.commands.focus("start");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, initialHtml]);

  const hasContent = () =>
    to.length + cc.length + bcc.length > 0 || subject.trim().length > 0 || (editor?.getText().replace(/^\s*--\s*$/m, "").trim().length ?? 0) > 0 || attachments.length > 0;

  const close = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (dirtyRef.current && hasContent()) {
      try {
        await save();
      } catch {
        /* handled below */
      }
      if (dirtyRef.current) {
        const ok = await confirm({
          title: "Discard unsaved changes?",
          description: "Your latest changes couldn't be saved. Close anyway?",
          confirmLabel: "Discard changes",
          destructive: true,
        });
        if (!ok) return;
      } else {
        toast("Draft saved");
      }
    } else if (draftIdRef.current && !hasContent()) {
      await api(`/api/drafts/${draftIdRef.current}`, { method: "DELETE" }).catch(() => undefined);
    } else if (draftIdRef.current) {
      toast("Draft saved");
    }
    uploads.forEach((u) => u.controller.abort());
    void qc.invalidateQueries({ queryKey: ["threads"] });
    void qc.invalidateQueries({ queryKey: qk.counts });
    onClose();
  };

  const discard = async () => {
    if (hasContent()) {
      const ok = await confirm({ title: "Discard this draft?", description: "The draft and its attachments will be deleted.", confirmLabel: "Discard", destructive: true });
      if (!ok) return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyRef.current = false;
    if (draftIdRef.current) {
      await api(`/api/drafts/${draftIdRef.current}`, { method: "DELETE" }).catch(() => undefined);
    }
    uploads.forEach((u) => u.controller.abort());
    void qc.invalidateQueries({ queryKey: ["threads"] });
    void qc.invalidateQueries({ queryKey: ["thread"] });
    void qc.invalidateQueries({ queryKey: qk.counts });
    toast("Draft discarded");
    onClose();
  };

  const fmtTime = (d: Date) => {
    try {
      return new Intl.DateTimeFormat(prefs.locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(d);
    } catch {
      return d.toLocaleString();
    }
  };

  const send = async (scheduledAt?: Date) => {
    setSendError(null);
    const all = [...to, ...cc, ...bcc];
    if (all.length === 0) {
      setSendError("Add at least one recipient.");
      return;
    }
    const invalid = all.filter((a) => !isValidAddress(a.address));
    if (invalid.length) {
      setSendError(`Check these addresses: ${invalid.map((a) => a.address).join(", ")}`);
      return;
    }
    if (uploads.some((u) => !u.error)) {
      setSendError("Wait for attachments to finish uploading.");
      return;
    }
    if (!subject.trim() && !scheduledAt) {
      const ok = await confirm({ title: "Send without a subject?", confirmLabel: "Send anyway" });
      if (!ok) return;
    }
    setSending(true);
    try {
      if (timerRef.current) clearTimeout(timerRef.current);
      dirtyRef.current = true;
      if (!draftIdRef.current) lastSavedKey.current = "";
      const id = await save();
      if (!id || dirtyRef.current) throw new Error("The draft couldn't be saved. Check your connection and try again.");
      const res = await api<{ id: string; threadId: string; status: string; sendAt: string; undoable: boolean }>(`/api/drafts/${id}/send`, {
        body: scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {},
      });
      dirtyRef.current = false;
      void qc.invalidateQueries({ queryKey: ["threads"] });
      void qc.invalidateQueries({ queryKey: ["thread", res.threadId] });
      void qc.invalidateQueries({ queryKey: qk.counts });
      const undo = async () => {
        try {
          await api(`/api/messages/${res.id}/cancel`, { method: "POST", body: {} });
          void qc.invalidateQueries({ queryKey: ["threads"] });
          void qc.invalidateQueries({ queryKey: ["thread", res.threadId] });
          void qc.invalidateQueries({ queryKey: qk.counts });
          openCompose({ draftId: res.id });
          toast(scheduledAt ? "Schedule cancelled. The message is back in Drafts." : "Sending undone");
        } catch (err) {
          toast.error(errorMessage(err));
        }
      };
      if (scheduledAt) {
        toast(`Scheduled for ${fmtTime(scheduledAt)}`, { action: { label: "Cancel", onClick: () => void undo() } });
      } else {
        toast(res.undoable ? "Sending…" : "Message sent", {
          duration: res.undoable ? settings.undoSendSeconds * 1000 : 4000,
          action: res.undoable ? { label: "Undo", onClick: () => void undo() } : undefined,
        });
      }
      onSent?.();
      onClose();
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };
  useEffect(() => {
    sendRef.current = (d?: Date) => void send(d);
  });

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const id =
      draftIdRef.current ??
      (await (async () => {
        dirtyRef.current = true;
        lastSavedKey.current = "";
        return save().catch(() => null);
      })());
    if (!id) {
      toast.error("Couldn't create the draft for the attachment.");
      return;
    }
    for (const file of list) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      if (file.size > MAX_FILE) {
        setUploads((u) => [...u, { key, name: file.name, size: file.size, progress: 0, error: "Larger than 20 MB", controller: new AbortController() }]);
        continue;
      }
      const controller = new AbortController();
      setUploads((u) => [...u, { key, name: file.name, size: file.size, progress: 0, controller }]);
      const form = new FormData();
      form.append("file", file);
      uploadWithProgress<AttachmentDTO>(`/api/drafts/${id}/attachments`, form, (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))), controller.signal)
        .then((att) => {
          setUploads((u) => u.filter((x) => x.key !== key));
          setAttachments((a) => [...a, att]);
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") {
            setUploads((u) => u.filter((x) => x.key !== key));
            return;
          }
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: errorMessage(err) } : x)));
        });
    }
  };

  const removeAttachment = async (a: AttachmentDTO) => {
    setAttachments((list) => list.filter((x) => x.id !== a.id));
    try {
      await api(`/api/attachments/${a.id}`, { method: "DELETE" });
    } catch (err) {
      setAttachments((list) => [...list, a]);
      toast.error(errorMessage(err));
    }
  };

  const title = subject.trim() || (request.mode === "reply" || request.mode === "reply_all" ? "Reply" : request.mode === "forward" ? "Forward" : "New message");
  const statusText =
    saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save" : saveState === "saved" && savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";

  const header =
    variant === "floating" ? (
      <div
        className={cn("flex h-10 shrink-0 cursor-default items-center gap-1 rounded-t-lg bg-ink pr-1 pl-4 text-canvas", minimized && "rounded-b-lg")}
        onDoubleClick={onMinimize}
      >
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</h2>
        <Tooltip content={minimized ? "Restore" : "Minimise"}>
          <button type="button" aria-label={minimized ? "Restore" : "Minimise"} onClick={onMinimize} className="flex size-7 items-center justify-center rounded text-canvas/80 hover:bg-white/10 hover:text-canvas">
            <Minus className="size-4" />
          </button>
        </Tooltip>
        {onExpand ? (
          <Tooltip content="Open full page">
            <button
              type="button"
              aria-label="Open full page"
              onClick={async () => {
                dirtyRef.current = true;
                if (!draftIdRef.current) lastSavedKey.current = "";
                const id = await save().catch(() => null);
                if (id) onExpand(id);
              }}
              className="hidden size-7 items-center justify-center rounded text-canvas/80 hover:bg-white/10 hover:text-canvas sm:flex"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip content="Save and close">
          <button type="button" aria-label="Save and close" onClick={() => void close()} className="flex size-7 items-center justify-center rounded text-canvas/80 hover:bg-white/10 hover:text-canvas">
            <X className="size-4" />
          </button>
        </Tooltip>
      </div>
    ) : null;

  if (minimized) return header;

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", dragOver && "ring-2 ring-accent ring-inset")}
      onKeyDown={(e) => {
        if (e.key === "Escape" && variant === "floating") {
          e.stopPropagation();
          void close();
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }
      }}
    >
      {header}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16 text-ink-subtle">
          <Spinner label="Loading draft" />
        </div>
      ) : loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <FileWarning className="size-5 text-danger" aria-hidden />
          <p className="text-[13px] text-ink-muted">{loadError}</p>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <>
          <div className="shrink-0">
            {variant !== "inline" ? (
              <div className="flex h-9 items-center border-b border-line px-4 text-[13px] text-ink-subtle">
                <span className="w-12 shrink-0">From</span>
                <span className="truncate text-ink-muted">{me.address}</span>
              </div>
            ) : null}
            <RecipientInput
              label="To"
              value={to}
              onChange={setTo}
              autoFocus={variant === "floating" && (!request.mode || request.mode === "new" || request.mode === "forward") && to.length === 0}
              trailing={
                <div className="flex shrink-0 gap-1 pt-1 text-[12px] text-ink-subtle">
                  {!showCc ? (
                    <button type="button" onClick={() => setShowCc(true)} className="rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink">
                      Cc
                    </button>
                  ) : null}
                  {!showBcc ? (
                    <button type="button" onClick={() => setShowBcc(true)} className="rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink">
                      Bcc
                    </button>
                  ) : null}
                </div>
              }
            />
            {showCc ? <RecipientInput label="Cc" value={cc} onChange={setCc} /> : null}
            {showBcc ? <RecipientInput label="Bcc" value={bcc} onChange={setBcc} /> : null}
            <div className="flex h-10 items-center border-b border-line px-4">
              <label htmlFor={`subject-${draftId ?? "new"}`} className="sr-only">
                Subject
              </label>
              <input
                id={`subject-${draftId ?? "new"}`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                maxLength={998}
                className="h-full w-full bg-transparent text-[13px] font-medium text-ink placeholder:font-normal placeholder:text-ink-faint focus:outline-none"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scrollbar-thin" onClick={() => editor?.commands.focus()}>
            <MailEditorContent editor={editor} />
            {quotedHtml ? (
              <div className="mt-2">
                <Tooltip content={showQuoted ? "Hide quoted text" : "Show quoted text"} side="top">
                  <button
                    type="button"
                    aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"}
                    aria-expanded={showQuoted}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQuoted((v) => !v);
                    }}
                    className="flex h-4 items-center rounded bg-active px-1.5 text-ink-subtle hover:text-ink"
                  >
                    <Ellipsis className="size-4" />
                  </button>
                </Tooltip>
                {showQuoted ? (
                  <div className="mt-2 opacity-80" onClick={(e) => e.stopPropagation()}>
                    <EmailFrame html={quotedHtml} allowRemote={false} dark={typeof document !== "undefined" && document.documentElement.classList.contains("dark")} title="Quoted message" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {attachments.length + uploads.length > 0 ? (
            <ul className="flex shrink-0 flex-wrap gap-2 border-t border-line px-4 py-2.5" aria-label="Attachments">
              {attachments.map((a) => (
                <li key={a.id} className="flex h-8 max-w-60 items-center gap-2 rounded-md border border-line bg-surface pr-1 pl-2.5 text-[12px]">
                  <Paperclip className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                  <span className="truncate font-medium">{a.filename}</span>
                  <span className="shrink-0 text-ink-subtle">{formatBytes(a.size)}</span>
                  <button type="button" aria-label={`Remove ${a.filename}`} onClick={() => void removeAttachment(a)} className="flex size-6 items-center justify-center rounded text-ink-subtle hover:bg-hover hover:text-ink">
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
              {uploads.map((u) => (
                <li
                  key={u.key}
                  className={cn("relative flex h-8 max-w-60 items-center gap-2 overflow-hidden rounded-md border pr-1 pl-2.5 text-[12px]", u.error ? "border-danger/40 bg-danger-soft text-danger" : "border-line")}
                  title={u.error}
                >
                  {!u.error ? <span className="absolute inset-y-0 left-0 bg-accent-soft" style={{ width: `${Math.round(u.progress * 100)}%` }} aria-hidden /> : null}
                  <span className="relative truncate">{u.name}</span>
                  <span className="relative shrink-0">{u.error ? u.error : `${Math.round(u.progress * 100)}%`}</span>
                  <button
                    type="button"
                    aria-label={u.error ? `Dismiss ${u.name}` : `Cancel upload of ${u.name}`}
                    onClick={() => {
                      u.controller.abort();
                      setUploads((list) => list.filter((x) => x.key !== u.key));
                    }}
                    className="relative flex size-6 items-center justify-center rounded hover:bg-hover"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {sendError ? (
            <p role="alert" className="shrink-0 border-t border-danger/20 bg-danger-soft px-4 py-2 text-[12px] text-danger">
              {sendError}
            </p>
          ) : null}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2">
            <div className="flex">
              <Button variant="primary" size="sm" className="rounded-r-none" onClick={() => void send()} loading={sending}>
                <Send className="size-3.5" />
                Send
              </Button>
              <ScheduleMenu onSchedule={(d) => void send(d)} disabled={sending} fmt={fmtTime} />
            </div>
            <Toolbar editor={editor} />
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <IconButton label="Attach files" icon={<Paperclip />} onClick={() => fileRef.current?.click()} tooltipSide="top" />
            <span className="ml-auto text-[11px] text-ink-subtle" aria-live="polite">
              {statusText}
            </span>
            <IconButton label="Discard draft" icon={<Trash2 />} onClick={() => void discard()} tooltipSide="top" />
            {variant !== "floating" ? <IconButton label="Close" icon={<X />} onClick={() => void close()} tooltipSide="top" /> : null}
          </div>
        </>
      )}
    </div>
  );
}
