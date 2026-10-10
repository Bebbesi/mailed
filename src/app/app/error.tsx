"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      className="h-full"
      icon={<AlertCircle />}
      title="Something went wrong"
      description={error.digest ? `The page couldn't be displayed (reference ${error.digest}).` : "The page couldn't be displayed."}
      action={
        <Button size="sm" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
