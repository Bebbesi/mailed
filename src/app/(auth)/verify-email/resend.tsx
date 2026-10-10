"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/auth/auth-card";
import { api, errorMessage } from "@/lib/client/api";

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "not-sent" | "error">("idle");
  const [message, setMessage] = useState("");
  return (
    <div className="mt-5 space-y-3">
      {state === "sent" ? <FormAlert tone="ok">A new link is on its way to {email}.</FormAlert> : null}
      {state === "not-sent" ? (
        <FormAlert tone="info">The email could not be delivered because outgoing mail is not configured on this server. Contact the administrator.</FormAlert>
      ) : null}
      {state === "error" ? <FormAlert>{message}</FormAlert> : null}
      <Button
        variant="secondary"
        className="w-full"
        loading={state === "loading"}
        onClick={async () => {
          setState("loading");
          try {
            const res = await api<{ sent: boolean; alreadyVerified: boolean }>("/api/auth/resend-verification", { method: "POST", body: {} });
            setState(res.sent || res.alreadyVerified ? "sent" : "not-sent");
          } catch (err) {
            setMessage(errorMessage(err));
            setState("error");
          }
        }}
      >
        Send a new link
      </Button>
    </div>
  );
}
