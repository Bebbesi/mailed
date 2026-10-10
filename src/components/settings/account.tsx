"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/auth/password-input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { qk } from "@/lib/client/hooks";
import type { MeDTO } from "@/lib/types";
import { Section } from "./section";

function ProfileForm({ me }: { me: MeDTO }) {
  const qc = useQueryClient();
  const [first, setFirst] = useState(me.firstName);
  const [last, setLast] = useState(me.lastName);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const dirty = first !== me.firstName || last !== me.lastName;

  const uploadAvatar = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Images can be at most 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const updated = await api<MeDTO>("/api/me/avatar", { body: form });
      qc.setQueryData(qk.me, updated);
      toast("Photo updated");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title="Profile" description="Your name appears on messages you send unless you set a different sender name.">
      <div className="flex items-center gap-4">
        <Avatar name={`${me.firstName} ${me.lastName}`} email={me.address} src={me.avatarUrl} size={56} />
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadAvatar(e.target.files[0])} />
          <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload className="size-3.5" />
            Upload photo
          </Button>
          {me.avatarUrl ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await api("/api/me/avatar", { method: "DELETE" }).catch((e) => toast.error(errorMessage(e)));
                void qc.invalidateQueries({ queryKey: qk.me });
              }}
            >
              Remove
            </Button>
          ) : null}
          <p className="w-full text-xs text-ink-subtle">PNG, JPEG, WebP or GIF, up to 2 MB.</p>
        </div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            const updated = await api<MeDTO>("/api/me", { method: "PATCH", body: { firstName: first, lastName: last } });
            qc.setQueryData(qk.me, updated);
            toast("Profile updated");
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="first" label="First name">
            <Input id="first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={60} autoComplete="given-name" />
          </Field>
          <Field id="last" label="Last name">
            <Input id="last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={60} autoComplete="family-name" />
          </Field>
        </div>
        <Field id="address" label="Mailed address" hint="Your address can't be changed.">
          <Input id="address" value={me.address} readOnly aria-readonly className="bg-hover" />
        </Field>
        <Button type="submit" variant="primary" size="sm" disabled={!dirty || !first.trim() || !last.trim()} loading={saving}>
          Save profile
        </Button>
      </form>
    </Section>
  );
}

function RecoveryEmail({ me }: { me: MeDTO }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Recovery email" description="Used to confirm your identity and to reset your password.">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-medium text-ink">{me.recoveryEmail}</span>
        {me.emailVerified ? (
          <Badge tone="ok">
            <CheckCircle2 className="size-3" /> Confirmed
          </Badge>
        ) : (
          <Badge tone="warn">
            <AlertCircle className="size-3" /> Not confirmed
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!me.emailVerified ? (
          <Button
            size="sm"
            loading={busy && !editing}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api<{ sent: boolean }>("/api/auth/resend-verification", { method: "POST", body: {} });
                toast(res.sent ? `Confirmation link sent to ${me.recoveryEmail}` : "Couldn't send the email: outgoing mail isn't configured on this server.");
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Resend confirmation
          </Button>
        ) : null}
        {!editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change recovery email
          </Button>
        ) : null}
      </div>
      {editing ? (
        <form
          className="space-y-4 rounded-lg border border-line p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await api("/api/me/recovery-email", { body: { email, password } });
              void qc.invalidateQueries({ queryKey: qk.me });
              toast(`We sent a confirmation link to ${email}`);
              setEditing(false);
              setEmail("");
              setPassword("");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field id="new-recovery" label="New recovery email" error={error ?? undefined}>
            <Input id="new-recovery" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field id="recovery-password" label="Current password">
            <PasswordInput id="recovery-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" loading={busy}>
              Save and send confirmation
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </Section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Password" description="Changing your password signs you out on every other device.">
      <form
        className="max-w-md space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const errs: Record<string, string> = {};
          if (next.length < 10) errs.newPassword = "Use at least 10 characters.";
          if (next !== confirm) errs.confirm = "The passwords don't match.";
          setErrors(errs);
          if (Object.keys(errs).length) return;
          setBusy(true);
          try {
            const res = await api<{ revokedSessions: number }>("/api/me/password", { body: { currentPassword: current, newPassword: next } });
            toast(`Password changed${res.revokedSessions ? `. Signed out of ${res.revokedSessions} other session${res.revokedSessions === 1 ? "" : "s"}.` : "."}`);
            setCurrent("");
            setNext("");
            setConfirm("");
          } catch (err) {
            if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message });
            else setErrors({ newPassword: errorMessage(err) });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id="current-password" label="Current password" error={errors.currentPassword}>
          <PasswordInput id="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field id="new-password" label="New password" error={errors.newPassword} hint="At least 10 characters.">
          <PasswordInput id="new-password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field id="confirm-password" label="Confirm new password" error={errors.confirm}>
          <PasswordInput id="confirm-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!current || !next}>
          Change password
        </Button>
      </form>
    </Section>
  );
}

function DeleteAccount({ me }: { me: MeDTO }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Delete account" description="Permanently delete your account, every message and attachment, and all settings.">
      <div className="rounded-lg border border-danger/25 p-4">
        <p className="text-[13px] text-ink-muted">
          This can&apos;t be undone. <span className="font-medium text-ink">{me.address}</span> will stop receiving mail. Consider exporting your data first.
        </p>
        <Button variant="danger" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          Delete account…
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setError(null);
        }}
      >
        <DialogContent
          title="Delete your account?"
          description="All mail, attachments, contacts and settings will be deleted immediately and permanently."
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={busy}
                disabled={confirmText !== "DELETE" || !password}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api("/api/me", { method: "DELETE", body: { password, confirm: confirmText } });
                    qc.clear();
                    router.replace("/?deleted=1");
                  } catch (err) {
                    setError(errorMessage(err));
                    setBusy(false);
                  }
                }}
              >
                Delete permanently
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {error ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
                {error}
              </p>
            ) : null}
            <Field id="delete-password" label="Password">
              <PasswordInput id="delete-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field id="delete-confirm" label='Type "DELETE" to confirm'>
              <Input id="delete-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            </Field>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

export function AccountSettings({ me }: { me: MeDTO }) {
  return (
    <>
      <ProfileForm me={me} />
      <RecoveryEmail me={me} />
      <PasswordForm />
      <DeleteAccount me={me} />
    </>
  );
}
