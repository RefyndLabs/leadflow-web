"use client";

import * as React from "react";
import { AlertDialog as A } from "radix-ui";
import { Button } from "./button";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  /** Names the action ("Delete account"), never a bare "OK". */
  confirmLabel: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const Ctx = React.createContext<ConfirmFn | null>(null);

/** Promise-based confirmation, used for destructive or irreversible actions only. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = React.useCallback<ConfirmFn>(
    (opts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <A.Root
        open={state !== null}
        onOpenChange={(open) => !open && close(false)}
      >
        <A.Portal>
          <A.Overlay className="fixed inset-0 z-[60] bg-black/40 animate-fade-in" />
          <A.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 animate-pop rounded-[16px] bg-surface p-5 shadow-[var(--shadow-float)] outline-none">
            <A.Title className="text-[17px] font-semibold">
              {state?.title}
            </A.Title>
            <A.Description asChild>
              <div className="mt-1.5 text-[14px] text-muted">
                {state?.description}
              </div>
            </A.Description>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {/* Cancel takes initial focus so Enter never confirms a destructive action by accident. */}
              <A.Cancel asChild>
                <Button variant="secondary">Cancel</Button>
              </A.Cancel>
              <A.Action asChild>
                <Button
                  variant={state?.destructive ? "danger" : "primary"}
                  onClick={() => close(true)}
                >
                  {state?.confirmLabel}
                </Button>
              </A.Action>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </Ctx.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
