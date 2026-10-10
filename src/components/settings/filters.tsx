"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Pencil, Play, Plus, ShieldBan, ShieldCheck, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/client/api";
import { useLabels } from "@/lib/client/hooks";
import type { LabelDTO } from "@/lib/types";
import { Section } from "./section";

type Condition = { field: "from" | "to" | "subject" | "body" | "has_attachment" | "list_id"; op: "contains" | "not_contains" | "equals" | "ends_with" | "is_true"; value: string };
type Action =
  | { type: "apply_label"; labelId: string }
  | { type: "mark_read" | "star" | "archive" | "trash" | "mark_important" | "mark_spam" | "never_spam" }
  | { type: "set_category"; category: string };
type Rule = { id: string; name: string; enabled: boolean; match: "all" | "any"; conditions: Condition[]; actions: Action[]; stopProcessing: boolean };

const FIELDS: Record<Condition["field"], string> = { from: "From", to: "To", subject: "Subject", body: "Message text", has_attachment: "Has attachment", list_id: "Mailing list" };
const OPS: Record<Condition["op"], string> = { contains: "contains", not_contains: "doesn't contain", equals: "is", ends_with: "ends with", is_true: "is present" };
const SIMPLE_ACTIONS: Record<string, string> = {
  mark_read: "Mark as read",
  star: "Star it",
  archive: "Skip the Inbox (archive)",
  trash: "Delete it",
  mark_important: "Mark as important",
  mark_spam: "Send to Spam",
  never_spam: "Never send to Spam",
};
const CATEGORY_NAMES: Record<string, string> = { primary: "Primary", social: "Social", promotions: "Promotions", updates: "Updates", forums: "Forums", ads: "Ads" };

function describeAction(a: Action, labels: LabelDTO[]) {
  if (a.type === "apply_label") return `Label “${labels.find((l) => l.id === a.labelId)?.name ?? "deleted label"}”`;
  if (a.type === "set_category") return `Categorise as ${CATEGORY_NAMES[a.category]}`;
  return SIMPLE_ACTIONS[a.type];
}

function RuleDialog({ open, onOpenChange, rule, labels }: { open: boolean; onOpenChange: (v: boolean) => void; rule: Rule | null; labels: LabelDTO[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState(rule?.name ?? "");
  const [match, setMatch] = useState<"all" | "any">(rule?.match ?? "all");
  const [conditions, setConditions] = useState<Condition[]>(rule?.conditions ?? [{ field: "from", op: "contains", value: "" }]);
  const [actions, setActions] = useState<Action[]>(rule?.actions ?? [{ type: "archive" }]);
  const [stop, setStop] = useState(rule?.stopProcessing ?? false);
  const [applyExisting, setApplyExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Give the filter a name.");
    if (conditions.some((c) => c.field !== "has_attachment" && c.op !== "is_true" && !c.value.trim())) return setError("Fill in every condition.");
    setSaving(true);
    try {
      const body = { name, match, conditions, actions, stopProcessing: stop, enabled: rule?.enabled ?? true };
      const saved = rule ? await api<Rule>(`/api/rules/${rule.id}`, { method: "PUT", body }) : await api<Rule>("/api/rules", { body });
      if (applyExisting) {
        const res = await api<{ matched: number }>(`/api/rules/${saved.id}/apply`, { method: "POST", body: {} });
        toast(`Filter saved and applied to ${res.matched} existing message${res.matched === 1 ? "" : "s"}`);
        void qc.invalidateQueries({ queryKey: ["threads"] });
      } else toast("Filter saved");
      void qc.invalidateQueries({ queryKey: ["rules"] });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={rule ? "Edit filter" : "Create filter"}
        description="Filters run on every incoming message, after spam checks."
        className="max-w-2xl"
        footer={
          <>
            <label className="mr-auto flex items-center gap-2 text-[13px] text-ink-muted">
              <Checkbox checked={applyExisting} onCheckedChange={setApplyExisting} />
              Also apply to matching messages in Inbox and Archive
            </label>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Save filter
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <Field id="rule-name" label="Name">
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Invoices from suppliers" maxLength={100} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="mb-2 flex items-center gap-2 text-[13px] font-medium">
              When a message matches
              <Select aria-label="Match" value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")} className="h-8 w-28">
                <option value="all">all</option>
                <option value="any">any</option>
              </Select>
              of these conditions
            </legend>
            {conditions.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Field"
                  value={c.field}
                  onChange={(e) => {
                    const field = e.target.value as Condition["field"];
                    setConditions(conditions.map((x, j) => (j === i ? { ...x, field, op: field === "has_attachment" ? "is_true" : x.op === "is_true" ? "contains" : x.op, value: field === "has_attachment" ? "true" : x.value } : x)));
                  }}
                  className="h-8 w-40"
                >
                  {Object.entries(FIELDS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
                {c.field !== "has_attachment" ? (
                  <>
                    <Select aria-label="Operator" value={c.op} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as Condition["op"] } : x)))} className="h-8 w-40">
                      {(["contains", "not_contains", "equals", "ends_with"] as const).map((o) => (
                        <option key={o} value={o}>
                          {OPS[o]}
                        </option>
                      ))}
                    </Select>
                    <Input aria-label="Value" value={c.value} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-8 min-w-40 flex-1" />
                  </>
                ) : null}
                {conditions.length > 1 ? <IconButton label="Remove condition" icon={<X />} onClick={() => setConditions(conditions.filter((_, j) => j !== i))} /> : null}
              </div>
            ))}
            <Button size="xs" variant="ghost" onClick={() => setConditions([...conditions, { field: "subject", op: "contains", value: "" }])} disabled={conditions.length >= 10}>
              <Plus className="size-3.5" /> Add condition
            </Button>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[13px] font-medium">Do this</legend>
            {actions.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Action"
                  value={a.type}
                  onChange={(e) => {
                    const type = e.target.value;
                    const next: Action =
                      type === "apply_label" ? { type, labelId: labels[0]?.id ?? "" } : type === "set_category" ? { type, category: "updates" } : ({ type } as Action);
                    setActions(actions.map((x, j) => (j === i ? next : x)));
                  }}
                  className="h-8 w-56"
                >
                  {Object.entries(SIMPLE_ACTIONS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                  <option value="apply_label" disabled={labels.length === 0}>
                    Apply label…
                  </option>
                  <option value="set_category">Categorise as…</option>
                </Select>
                {a.type === "apply_label" ? (
                  <Select aria-label="Label" value={a.labelId} onChange={(e) => setActions(actions.map((x, j) => (j === i ? { type: "apply_label", labelId: e.target.value } : x)))} className="h-8 w-48">
                    {labels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                ) : null}
                {a.type === "set_category" ? (
                  <Select aria-label="Category" value={a.category} onChange={(e) => setActions(actions.map((x, j) => (j === i ? { type: "set_category", category: e.target.value } : x)))} className="h-8 w-40">
                    {Object.entries(CATEGORY_NAMES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                ) : null}
                {actions.length > 1 ? <IconButton label="Remove action" icon={<X />} onClick={() => setActions(actions.filter((_, j) => j !== i))} /> : null}
              </div>
            ))}
            <Button size="xs" variant="ghost" onClick={() => setActions([...actions, { type: "mark_read" }])} disabled={actions.length >= 10}>
              <Plus className="size-3.5" /> Add action
            </Button>
          </fieldset>
          <label className="flex items-center gap-2.5 text-[13px] text-ink-muted">
            <Checkbox checked={stop} onCheckedChange={setStop} />
            Don&apos;t run other filters after this one
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SenderLists() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({
    queryKey: ["senders"],
    queryFn: () => api<{ entries: { id: string; kind: "blocked" | "trusted"; pattern: string; createdAt: string }[] }>("/api/senders"),
  });
  const [pattern, setPattern] = useState("");
  const [kind, setKind] = useState<"blocked" | "trusted">("blocked");
  const [error, setError] = useState<string | null>(null);
  const entries = data?.entries ?? [];

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/senders", { body: { kind, pattern } });
      setPattern("");
      void qc.invalidateQueries({ queryKey: ["senders"] });
      toast(kind === "blocked" ? "Sender blocked" : "Sender trusted");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const list = (k: "blocked" | "trusted") => entries.filter((x) => x.kind === k);
  return (
    <Section title="Blocked and trusted senders" description="Blocked senders always go to Spam. Trusted senders never do. Use an address or a whole domain.">
      <form onSubmit={add} className="flex flex-wrap items-start gap-2">
        <Select aria-label="List" value={kind} onChange={(e) => setKind(e.target.value as "blocked" | "trusted")} className="w-32">
          <option value="blocked">Block</option>
          <option value="trusted">Trust</option>
        </Select>
        <div className="min-w-56 flex-1">
          <Input aria-label="Address or domain" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="name@example.com or example.com" aria-invalid={error ? true : undefined} />
          {error ? (
            <p role="alert" className="mt-1 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={!pattern.trim()}>
          Add
        </Button>
      </form>
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {(["blocked", "trusted"] as const).map((k) => (
            <div key={k}>
              <h3 className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink-subtle">
                {k === "blocked" ? <ShieldBan className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                {k === "blocked" ? "Blocked" : "Trusted"} ({list(k).length})
              </h3>
              {list(k).length === 0 ? (
                <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-ink-subtle">None</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {list(k).map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-3 text-[13px]">
                      <span className="truncate">{x.pattern.startsWith("@") ? `Anyone at ${x.pattern.slice(1)}` : x.pattern}</span>
                      <IconButton
                        label={`Remove ${x.pattern}`}
                        icon={<Trash2 />}
                        onClick={async () => {
                          if (!(await confirm({ title: `Remove ${x.pattern}?`, confirmLabel: "Remove" }))) return;
                          await api(`/api/senders/${x.id}`, { method: "DELETE" }).catch((e) => toast.error(errorMessage(e)));
                          void qc.invalidateQueries({ queryKey: ["senders"] });
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function FiltersSettings({ initialLabels }: { initialLabels: LabelDTO[] }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: labels = initialLabels } = useLabels(initialLabels);
  const { data, isLoading } = useQuery({ queryKey: ["rules"], queryFn: () => api<{ rules: Rule[] }>("/api/rules") });
  const [dialog, setDialog] = useState<{ open: boolean; rule: Rule | null; key: number }>({ open: false, rule: null, key: 0 });
  const rules = data?.rules ?? [];

  return (
    <>
      <Section title="Filters" description="Organise incoming mail automatically: label it, archive it, star it or file it in a category.">
        <div>
          <Button size="sm" onClick={() => setDialog({ open: true, rule: null, key: dialog.key + 1 })}>
            <Plus className="size-3.5" /> Create filter
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : rules.length === 0 ? (
          <EmptyState className="rounded-lg border border-dashed border-line py-10" icon={<Filter />} title="No filters yet" description="For example: archive and label everything from billing@ as “Finance”." />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {rules.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <Switch
                  aria-label={`Enable ${r.name}`}
                  checked={r.enabled}
                  onCheckedChange={async (enabled) => {
                    await api(`/api/rules/${r.id}`, { method: "PUT", body: { ...r, enabled } }).catch((e) => toast.error(errorMessage(e)));
                    void qc.invalidateQueries({ queryKey: ["rules"] });
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{r.name}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">
                    If {r.match === "all" ? "all" : "any"}: {r.conditions.map((c) => (c.field === "has_attachment" ? "has attachment" : `${FIELDS[c.field].toLowerCase()} ${OPS[c.op]} “${c.value}”`)).join(r.match === "all" ? " and " : " or ")}
                  </p>
                  <p className="text-xs text-ink-subtle">Then: {r.actions.map((a) => describeAction(a, labels)).join(", ")}</p>
                </div>
                <IconButton
                  label="Apply to existing mail"
                  icon={<Play />}
                  onClick={async () => {
                    try {
                      const res = await api<{ matched: number }>(`/api/rules/${r.id}/apply`, { method: "POST", body: {} });
                      toast(`Applied to ${res.matched} message${res.matched === 1 ? "" : "s"}`);
                      void qc.invalidateQueries({ queryKey: ["threads"] });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                />
                <IconButton label="Edit filter" icon={<Pencil />} onClick={() => setDialog({ open: true, rule: r, key: dialog.key + 1 })} />
                <IconButton
                  label="Delete filter"
                  icon={<Trash2 />}
                  onClick={async () => {
                    if (!(await confirm({ title: `Delete “${r.name}”?`, confirmLabel: "Delete", destructive: true }))) return;
                    await api(`/api/rules/${r.id}`, { method: "DELETE" }).catch((e) => toast.error(errorMessage(e)));
                    void qc.invalidateQueries({ queryKey: ["rules"] });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <SenderLists />
      {dialog.open ? <RuleDialog key={dialog.key} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} rule={dialog.rule} labels={labels} /> : null}
    </>
  );
}
