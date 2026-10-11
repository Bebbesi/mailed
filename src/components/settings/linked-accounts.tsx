"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, KeyRound, Link2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useApp } from "@/components/mail/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, fieldAria } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { relativeTime } from "@/lib/client/format";
import { qk } from "@/lib/client/hooks";
import { cn } from "@/lib/cn";
import { LINKED_PROVIDERS, PROVIDER_PRESETS, type LinkedProvider, type ServerConfig } from "@/lib/linked/providers";
import type { LinkedAccountDTO } from "@/lib/types";
import { Section } from "./section";

type ListResponse = { accounts: LinkedAccountDTO[]; oauth: { google: boolean; microsoft: boolean }; importDays: number };

const MARK: Record<LinkedProvider, { letter: string; className: string }> = {
  gmail: { letter: "G", className: "bg-[#fde8e7] text-[#b3261e] dark:bg-[#3b1a19] dark:text-[#f2b8b5]" },
  outlook: { letter: "O", className: "bg-[#e1ecfb] text-[#0f5cc0] dark:bg-[#17263d] dark:text-[#9cc3f5]" },
  yahoo: { letter: "Y", className: "bg-[#efe6fb] text-[#5b21b6] dark:bg-[#271b3d] dark:text-[#c9b2f5]" },
  icloud: { letter: "i", className: "bg-[#e8eaee] text-[#334155] dark:bg-[#232831] dark:text-[#c3cad6]" },
  other: { letter: "@", className: "bg-[#ddf3ef] text-[#0f6b5e] dark:bg-[#12302b] dark:text-[#8fd8c7]" },
};

function ProviderMark({ provider, size = "md" }: { provider: LinkedProvider; size?: "md" | "lg" }) {
  const m = MARK[provider];
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-md font-semibold", size === "lg" ? "size-9 text-[15px]" : "size-8 text-[13px]", m.className)}>
      {m.letter}
    </span>
  );
}

export function LinkedAccountsSettings() {
  const { prefs } = useApp();
  const qc = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading } = useQuery({
    queryKey: qk.linkedAccounts,
    queryFn: () => api<ListResponse>("/api/linked-accounts"),
    // Refresh while history is importing or an error may clear.
    refetchInterval: (q) => (q.state.data?.accounts.some((a) => a.importing || a.status === "error") ? 5_000 : 30_000),
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LinkedAccountDTO | null>(null);
  const [removing, setRemoving] = useState<LinkedAccountDTO | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.linkedAccounts });
    void qc.invalidateQueries({ queryKey: qk.me });
    void qc.invalidateQueries({ queryKey: qk.labels });
    void qc.invalidateQueries({ queryKey: qk.counts });
  };

  // Result of "Sign in with Google/Microsoft", passed back in the URL.
  useEffect(() => {
    const linked = params.get("linked");
    const error = params.get("link_error");
    if (!linked && !error) return;
    if (linked) toast.success(`Linked ${linked}. Recent mail is being imported.`);
    if (error) toast.error(error);
    refresh();
    router.replace(`${pathname}?tab=accounts`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const patch = async (a: LinkedAccountDTO, body: Record<string, unknown>) => {
    try {
      await api(`/api/linked-accounts/${a.id}`, { method: "PATCH", body });
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const syncNow = async (a: LinkedAccountDTO) => {
    try {
      await api(`/api/linked-accounts/${a.id}/sync`, { method: "POST", body: {} });
      toast("Checking for new mail…");
      setTimeout(refresh, 4000);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const accounts = data?.accounts ?? [];
  return (
    <>
      <Section
        title="Linked accounts"
        description={
          <>
            Read and send mail from Gmail, Outlook and other accounts in Mailed. New mail is copied here every minute and gets the account’s label.
            Changes you make in Mailed don’t change the original mailbox.
          </>
        }
      >
        <div>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> Add account
          </Button>
        </div>
        {isLoading ? null : accounts.length === 0 ? (
          <EmptyState
            className="rounded-lg border border-dashed border-line py-10"
            icon={<Link2 />}
            title="No linked accounts"
            description="Add Gmail, Outlook, Yahoo, iCloud or any IMAP account to see all your mail in one place."
          />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <ProviderMark provider={a.provider} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{a.email}</span>
                    {a.status === "auth_error" ? <Badge tone="danger">Needs reconnecting</Badge> : null}
                    {a.status === "error" ? <Badge tone="warn">Connection problem</Badge> : null}
                    {a.importing && a.status === "active" ? <Badge tone="accent">Importing recent mail</Badge> : null}
                  </div>
                  <p className="text-xs text-ink-subtle">
                    {PROVIDER_PRESETS[a.provider].name}
                    {a.displayName ? ` · Sends as “${a.displayName}”` : ""}
                    {!a.syncEnabled ? " · Fetching paused" : a.lastSyncAt ? ` · Checked ${relativeTime(a.lastSyncAt, prefs)}` : " · Waiting for first check"}
                  </p>
                  {a.lastError && a.status !== "active" ? <p className="text-xs text-danger">{a.lastError}</p> : null}
                  <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1.5">
                    <label className="flex items-center gap-2 text-xs text-ink-muted">
                      <Switch checked={a.syncEnabled} onCheckedChange={(v) => void patch(a, { syncEnabled: v })} aria-label={`Fetch mail from ${a.email}`} />
                      Fetch mail
                    </label>
                    <label className="flex items-center gap-2 text-xs text-ink-muted">
                      <Switch checked={a.sendEnabled} onCheckedChange={(v) => void patch(a, { sendEnabled: v })} aria-label={`Send from ${a.email}`} />
                      Send from this address
                    </label>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
                  {a.status === "auth_error" || a.authType === "password" ? (
                    <Button size="xs" variant={a.status === "auth_error" ? "primary" : "ghost"} onClick={() => reconnect(a, setEditing)}>
                      <KeyRound className="size-3.5" /> {a.status === "auth_error" ? "Reconnect" : "Password"}
                    </Button>
                  ) : null}
                  <IconButton label={`Check ${a.email} now`} icon={<RefreshCw />} onClick={() => void syncNow(a)} disabled={a.status === "auth_error"} />
                  <IconButton label={`Remove ${a.email}`} icon={<Trash2 />} onClick={() => setRemoving(a)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="How it works" description="What linking does and doesn’t do.">
        <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-muted">
          <li>Mailed copies the last {data?.importDays ?? 30} days of the account’s Inbox, then checks for new mail every minute.</li>
          <li>Replies go out from the address the message was sent to. In the composer you can pick any linked address.</li>
          <li>Passwords and sign-in tokens are stored encrypted. Removing an account deletes them.</li>
          <li>Gmail, Yahoo and iCloud need an app password (not your normal password). Outlook needs “Sign in with Microsoft”.</li>
        </ul>
      </Section>

      {adding ? <AddAccountDialog oauth={data?.oauth ?? { google: false, microsoft: false }} onClose={() => setAdding(false)} onLinked={refresh} /> : null}
      {editing ? <PasswordDialog account={editing} onClose={() => setEditing(null)} onSaved={refresh} /> : null}
      {removing ? <RemoveDialog account={removing} onClose={() => setRemoving(null)} onRemoved={refresh} /> : null}
    </>
  );
}

function oauthFor(provider: LinkedProvider) {
  return PROVIDER_PRESETS[provider].oauth;
}

function reconnect(a: LinkedAccountDTO, edit: (a: LinkedAccountDTO) => void) {
  const oauth = oauthFor(a.provider);
  if (a.authType === "oauth" && oauth) {
    // A full navigation: the API route redirects to the provider's consent screen.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/api/linked-accounts/oauth/${oauth}?email=${encodeURIComponent(a.email)}`);
  } else {
    edit(a);
  }
}

function AddAccountDialog({ oauth, onClose, onLinked }: { oauth: ListResponse["oauth"]; onClose: () => void; onLinked: () => void }) {
  const [provider, setProvider] = useState<LinkedProvider | null>(null);
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent
        title={provider ? `Add ${PROVIDER_PRESETS[provider].name}` : "Add an account"}
        description={provider ? undefined : "Choose where your mail is."}
        className="max-w-lg"
      >
        {provider ? (
          <AccountForm provider={provider} oauth={oauth} onBack={() => setProvider(null)} onLinked={() => (onLinked(), onClose())} />
        ) : (
          <div className="grid grid-cols-2 gap-2 pb-4 sm:grid-cols-3">
            {LINKED_PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className="flex items-center gap-3 rounded-lg border border-line p-3 text-left text-[13px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-hover"
              >
                <ProviderMark provider={p} />
                {PROVIDER_PRESETS[p].name}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_SERVERS: { imap: ServerConfig; smtp: ServerConfig } = {
  imap: { host: "", port: 993, security: "tls" },
  smtp: { host: "", port: 465, security: "tls" },
};

function AccountForm({
  provider,
  oauth,
  onBack,
  onLinked,
}: {
  provider: LinkedProvider;
  oauth: ListResponse["oauth"];
  onBack: () => void;
  onLinked: () => void;
}) {
  const preset = PROVIDER_PRESETS[provider];
  const oauthId = preset.oauth;
  const oauthReady = oauthId ? oauth[oauthId] : false;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [servers, setServers] = useState(DEFAULT_SERVERS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const account = await api<LinkedAccountDTO>("/api/linked-accounts", {
        body: {
          provider,
          email,
          password,
          displayName: displayName || undefined,
          ...(provider === "other" ? { username: username || undefined, imap: servers.imap, smtp: servers.smtp } : {}),
        },
      });
      toast.success(`Linked ${account.email}. Recent mail is being imported.`);
      onLinked();
    } catch (err) {
      const field = err instanceof ApiError ? ((err.details as { field?: string } | null)?.field ?? undefined) : undefined;
      setError({ message: errorMessage(err), field });
    } finally {
      setSubmitting(false);
    }
  };

  const oauthButton =
    oauthId && oauthReady ? (
      <Button type="button" variant={preset.passwordSupported ? "secondary" : "primary"} className="w-full" asChild>
        <a href={`/api/linked-accounts/oauth/${oauthId}${email ? `?email=${encodeURIComponent(email)}` : ""}`}>
          Sign in with {oauthId === "google" ? "Google" : "Microsoft"}
        </a>
      </Button>
    ) : null;

  const server = (kind: "imap" | "smtp", label: string) => (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-ink">{label}</legend>
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
        <Input
          aria-label={`${label} server`}
          placeholder={kind === "imap" ? "imap.example.com" : "smtp.example.com"}
          value={servers[kind].host}
          onChange={(e) => setServers((s) => ({ ...s, [kind]: { ...s[kind], host: e.target.value } }))}
          required
          autoComplete="off"
          spellCheck={false}
        />
        <Input
          aria-label={`${label} port`}
          inputMode="numeric"
          value={String(servers[kind].port)}
          onChange={(e) => setServers((s) => ({ ...s, [kind]: { ...s[kind], port: Number(e.target.value.replace(/\D/g, "")) || 0 } }))}
          required
        />
      </div>
      <Select
        aria-label={`${label} security`}
        value={servers[kind].security}
        onChange={(e) => setServers((s) => ({ ...s, [kind]: { ...s[kind], security: e.target.value as ServerConfig["security"] } }))}
      >
        <option value="tls">SSL/TLS{kind === "imap" ? " (port 993)" : " (port 465)"}</option>
        <option value="starttls">STARTTLS{kind === "imap" ? " (port 143)" : " (port 587)"}</option>
      </Select>
    </fieldset>
  );

  return (
    <form onSubmit={submit} className="space-y-4 pb-4" noValidate>
      <button type="button" onClick={onBack} className="-mt-1 inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink">
        <ArrowLeft className="size-3.5" /> All providers
      </button>

      {!preset.passwordSupported ? (
        oauthButton ?? (
          <div className="space-y-2 rounded-lg border border-line bg-hover/50 p-3 text-[13px] leading-relaxed text-ink-muted">
            <p>
              {preset.name} only allows other apps to connect through Microsoft sign-in, which isn’t set up on this server yet.
            </p>
            <p>
              The server owner needs to register an app with Microsoft and set <code className="font-mono text-xs">MICROSOFT_CLIENT_ID</code> and{" "}
              <code className="font-mono text-xs">MICROSOFT_CLIENT_SECRET</code>. See <code className="font-mono text-xs">docs/LINKED_ACCOUNTS.md</code>.
            </p>
          </div>
        )
      ) : (
        <>
          {oauthButton ? (
            <>
              {oauthButton}
              <div className="flex items-center gap-3 text-xs text-ink-faint">
                <span className="h-px flex-1 bg-line" /> or use an app password <span className="h-px flex-1 bg-line" />
              </div>
            </>
          ) : null}
          <Field id="linked-email" label="Email address" error={error?.field === "email" ? error.message : undefined}>
            <Input
              {...fieldAria("linked-email", error?.field === "email" ? error.message : undefined)}
              type="email"
              autoComplete="off"
              placeholder={provider === "gmail" ? "you@gmail.com" : "you@example.com"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field
            id="linked-password"
            label={preset.passwordLabel}
            hint={preset.passwordHelp}
            trailing={
              preset.helpUrl ? (
                <a href={preset.helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-ink hover:underline">
                  Create one <ExternalLink className="size-3" />
                </a>
              ) : undefined
            }
          >
            <Input
              {...fieldAria("linked-password", undefined, preset.passwordHelp)}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {provider === "other" ? (
            <>
              <Field id="linked-username" label="Username" hint="Leave empty if it’s the same as the email address.">
                <Input {...fieldAria("linked-username", undefined, true)} autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              {server("imap", "Incoming mail (IMAP)")}
              {server("smtp", "Outgoing mail (SMTP)")}
            </>
          ) : null}
          <Field id="linked-name" label="Your name on sent mail" hint="Optional. Leave empty to use your Mailed name.">
            <Input {...fieldAria("linked-name", undefined, true)} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
          </Field>
          {error && error.field !== "email" ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="submit" variant="primary" loading={submitting} disabled={!email || !password}>
              {submitting ? "Checking sign-in…" : "Link account"}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

function PasswordDialog({ account, onClose, onSaved }: { account: LinkedAccountDTO; onClose: () => void; onSaved: () => void }) {
  const preset = PROVIDER_PRESETS[account.provider];
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/linked-accounts/${account.id}`, { method: "PATCH", body: { password } });
      toast.success(`${account.email} reconnected`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent title={`Update password for ${account.email}`} description={preset.passwordHelp}>
        <form onSubmit={submit} className="space-y-4 pb-4">
          <Field id="linked-new-password" label={preset.passwordLabel} error={error ?? undefined}>
            <Input
              {...fieldAria("linked-new-password", error ?? undefined)}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!password}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ account, onClose, onRemoved }: { account: LinkedAccountDTO; onClose: () => void; onRemoved: () => void }) {
  const [deleteMail, setDeleteMail] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      const res = await api<{ deleted: number }>(`/api/linked-accounts/${account.id}${deleteMail ? "?deleteMail=1" : ""}`, { method: "DELETE" });
      toast(deleteMail ? `Removed ${account.email} and ${res.deleted} messages` : `Removed ${account.email}`);
      onRemoved();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent
        title={`Remove ${account.email}?`}
        description="Mailed stops fetching its mail and forgets the stored password or sign-in. The original mailbox isn’t changed."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Remove
            </Button>
          </>
        }
      >
        <label className="flex items-start gap-2.5 text-[13px] text-ink-muted">
          <Checkbox checked={deleteMail} onCheckedChange={setDeleteMail} className="mt-0.5" />
          <span>Also delete the mail Mailed copied from this account</span>
        </label>
      </DialogContent>
    </Dialog>
  );
}

