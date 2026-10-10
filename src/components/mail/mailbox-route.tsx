"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { SystemView, ViewRef } from "@/lib/types";
import { Mailbox } from "./mailbox";

export function MailboxRoute({ kind, value }: { kind: "system" | "label" | "search"; value?: string }) {
  const params = useParams<{ threadId?: string }>();
  const sp = useSearchParams();
  const threadId = typeof params.threadId === "string" && /^[0-9a-f-]{36}$/i.test(params.threadId) ? params.threadId : null;
  let view: ViewRef;
  if (kind === "system") view = { kind, view: value as SystemView };
  else if (kind === "label") view = { kind, labelId: value! };
  else {
    const q = sp.get("q")?.trim() ?? "";
    if (!q) {
      return (
        <EmptyState
          className="h-full"
          icon={<Search />}
          title="Search your mail"
          description='Type in the search box above. Try operators such as from:giulia, has:attachment, is:unread, after:2026/01/01 or "exact phrase".'
        />
      );
    }
    view = { kind: "search", query: q };
  }
  // Keyed by view so selection and filters reset when switching folders.
  const key = view.kind === "system" ? view.view : view.kind === "label" ? `label:${view.labelId}` : `search:${view.query}`;
  return <Mailbox key={key} view={view} threadId={threadId} />;
}
