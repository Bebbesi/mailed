"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog, DialogContent } from "./dialog";

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);

/** Promise-based confirmation dialog: `if (await confirm({...})) ...`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={Boolean(opts)} onOpenChange={(open) => !open && close(false)}>
        {opts ? (
          <DialogContent
            title={opts.title}
            description={opts.description}
            footer={
              <>
                <Button variant="secondary" onClick={() => close(false)}>
                  {opts.cancelLabel ?? "Cancel"}
                </Button>
                <Button variant={opts.destructive ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
                  {opts.confirmLabel ?? "Confirm"}
                </Button>
              </>
            }
          />
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
