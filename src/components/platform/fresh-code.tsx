"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** What the API accepts for a fresh authenticator code (PlatformFreshCode). */
export type FreshCodeBody = { code: string } | { recovery_code: string };

export function useFreshCode() {
  const [value, setValue] = React.useState("");
  const [recovery, setRecovery] = React.useState(false);
  return {
    value,
    setValue,
    recovery,
    setRecovery: (r: boolean) => {
      setRecovery(r);
      setValue("");
    },
    ready: value.trim().length > 0,
    body: (): FreshCodeBody =>
      recovery ? { recovery_code: value.trim() } : { code: value.trim() },
    reset: () => {
      setValue("");
      setRecovery(false);
    },
  };
}

/**
 * The authenticator code the API asks for before changing a password,
 * scheduling or confirming a deletion, or making someone an owner. A code
 * works once, so the one used to sign in a moment ago is spent.
 */
export function FreshCodeField({
  state,
  allowRecovery = true,
}: {
  state: ReturnType<typeof useFreshCode>;
  allowRecovery?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Field
        label={state.recovery ? "Recovery code" : "Authenticator code"}
        required
        hint={
          state.recovery
            ? "One of the recovery codes you saved. Each works once."
            : "The current 6-digit code from your authenticator app. The one you signed in with won't work again, so wait for the next one if needed."
        }
      >
        <Input
          inputMode={state.recovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          maxLength={state.recovery ? 40 : 10}
          value={state.value}
          onChange={(e) => state.setValue(e.target.value)}
        />
      </Field>
      {allowRecovery && (
        <Button
          type="button"
          variant="link"
          className="text-[13px]"
          onClick={() => state.setRecovery(!state.recovery)}
        >
          {state.recovery
            ? "Use the authenticator app"
            : "Lost your phone? Use a recovery code"}
        </Button>
      )}
    </div>
  );
}
