"use client";

import { useRouter } from "next/navigation";
import { Composer } from "./composer";

/** Full-page composer, also usable on small screens with the on-screen keyboard. */
export function ComposePage({ draftId }: { draftId?: string }) {
  const router = useRouter();
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="mx-auto flex h-full w-full max-w-4xl min-h-0 flex-col border-x border-line">
        <h1 className="shrink-0 border-b border-line px-4 py-3 text-[15px] font-semibold">{draftId ? "Draft" : "New message"}</h1>
        <Composer
          variant="page"
          request={draftId ? { draftId } : {}}
          onClose={() => (window.history.length > 1 ? router.back() : router.push("/app/inbox"))}
        />
      </div>
    </div>
  );
}
