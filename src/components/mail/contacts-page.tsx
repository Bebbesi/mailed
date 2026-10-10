"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact, Mail, MoreVertical, Pencil, Plus, Search, Star, Trash2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { relativeTime } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import type { ContactDTO } from "@/lib/types";
import { useApp } from "./app-context";

function ContactDialog({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (v: boolean) => void; contact: ContactDTO | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState(contact?.name ?? "");
  const [address, setAddress] = useState(contact?.address ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [favorite, setFavorite] = useState(contact?.isFavorite ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = { name, address, notes, isFavorite: favorite };
      if (contact) await api(`/api/contacts/${contact.id}`, { method: "PATCH", body });
      else await api("/api/contacts", { body });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      toast(contact ? "Contact updated" : "Contact added");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message });
      else setErrors({ form: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={contact ? "Edit contact" : "New contact"}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="contact-form" loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <form id="contact-form" onSubmit={save} className="space-y-4">
          {errors.form ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {errors.form}
            </p>
          ) : null}
          <Field id="contact-name" label="Name">
            <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field id="contact-address" label="Email address" error={errors.address}>
            <Input id="contact-address" type="email" value={address} onChange={(e) => setAddress(e.target.value)} required aria-invalid={errors.address ? true : undefined} />
          </Field>
          <Field id="contact-notes" label="Notes">
            <Textarea id="contact-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
          </Field>
          <label className="flex items-center gap-2.5 text-[13px] text-ink-muted">
            <Checkbox checked={favorite} onCheckedChange={setFavorite} />
            Favorite — suggested first when composing
          </label>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContactsPage() {
  const { openCompose, prefs } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; contact: ContactDTO | null; key: number }>({ open: false, contact: null, key: 0 });
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["contacts", debounced, favorites],
    queryFn: () => api<{ contacts: ContactDTO[]; total: number }>(`/api/contacts?limit=500&q=${encodeURIComponent(debounced)}${favorites ? "&favorites=1" : ""}`),
    placeholderData: keepPreviousData,
  });

  const toggleFavorite = async (c: ContactDTO) => {
    try {
      await api(`/api/contacts/${c.id}`, { method: "PATCH", body: { isFavorite: !c.isFavorite } });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async (c: ContactDTO) => {
    if (!(await confirm({ title: `Delete ${c.name || c.address}?`, description: "Your messages with this person are not affected.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await api(`/api/contacts/${c.id}`, { method: "DELETE" });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      toast("Contact deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-surface scrollbar-thin">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Contacts</h1>
            <p className="mt-0.5 text-[13px] text-ink-subtle">People you write to are added automatically.</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setDialog((d) => ({ open: true, contact: null, key: d.key + 1 }))}>
            <Plus className="size-3.5" /> New contact
          </Button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" aria-label="Search contacts" className="pl-9" />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <Checkbox checked={favorites} onCheckedChange={setFavorites} />
            Favorites only
          </label>
        </div>
        <div className="mt-5">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState icon={<AlertCircle />} title="Couldn't load contacts" description={errorMessage(error)} action={<Button size="sm" onClick={() => void refetch()}>Try again</Button>} />
          ) : !data || data.contacts.length === 0 ? (
            <EmptyState
              icon={<Contact />}
              title={debounced || favorites ? "No matching contacts" : "No contacts yet"}
              description={debounced || favorites ? "Try a different search." : "Send a message or add someone manually."}
            />
          ) : (
            <>
              <p className="mb-2 text-xs text-ink-subtle">{data.total} contact{data.total === 1 ? "" : "s"}</p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {data.contacts.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                    <Avatar name={c.name || c.address} email={c.address} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{c.name || c.address}</p>
                      <p className="truncate text-xs text-ink-subtle">
                        {c.name ? c.address : null}
                        {c.lastInteractionAt ? `${c.name ? " · " : ""}Last emailed ${relativeTime(c.lastInteractionAt, prefs)}` : null}
                      </p>
                    </div>
                    <IconButton
                      label={c.isFavorite ? "Remove from favorites" : "Add to favorites"}
                      pressed={c.isFavorite}
                      icon={<Star className={cn(c.isFavorite && "fill-[#e8a317] text-[#e8a317]")} />}
                      onClick={() => void toggleFavorite(c)}
                    />
                    <IconButton label={`Email ${c.name || c.address}`} icon={<Mail />} onClick={() => openCompose({ to: [{ name: c.name, address: c.address }] })} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton label="More" icon={<MoreVertical />} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem icon={<Pencil />} onSelect={() => setDialog((d) => ({ open: true, contact: c, key: d.key + 1 }))}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<Search />} onSelect={() => router.push(`/app/search?q=${encodeURIComponent(`from:${c.address}`)}`)}>
                          Find messages
                        </DropdownMenuItem>
                        <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => void remove(c)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <ContactDialog key={dialog.key} open={dialog.open} contact={dialog.contact} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </div>
  );
}
