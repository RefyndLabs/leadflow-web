"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { ApiError, describeError } from "@/lib/api/errors";
import {
  platformApi,
  usePlatformAction,
  usePlatformAdmins,
  usePlatformMe,
  type PlatformAdminCreated,
  type PlatformTemporaryPassword,
} from "@/lib/api/platform";
import { formatRelative } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PlatformChangePassword } from "./shell";
import { ShownOnce } from "./shown-once";

export function PlatformAdmins() {
  const confirm = useConfirm();
  const me = usePlatformMe();
  const q = usePlatformAdmins();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState<{
    email: string;
    secret: string;
  } | null>(null);

  const create = usePlatformAction(
    () =>
      platformApi<PlatformAdminCreated>("/admins", {
        method: "POST",
        body: { name, email: email.trim() },
      }),
    {
      handled: true,
      onSuccess: (c) => {
        setAdding(false);
        setName("");
        setEmail("");
        setShown({ email: c.admin.email, secret: c.temporary_password });
      },
    },
  );
  const act = usePlatformAction(
    ({ id, action }: { id: string; action: string }) =>
      platformApi<unknown>(`/admins/${id}/${action}`, { method: "POST" }),
    {
      success: "Done",
      onSuccess: (data, { action }) => {
        if (action === "reset-password") {
          const r = data as PlatformTemporaryPassword;
          setShown({ email: r.email, secret: r.temporary_password });
        }
      },
    },
  );

  const ask = async (
    title: string,
    description: string,
    confirmLabel: string,
  ) => confirm({ title, description, confirmLabel, destructive: true });

  return (
    <>
      <PageHeader
        title="Platform admins"
        description="People who can use this console. Each signs in with a password and an authenticator app."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add platform admin
          </Button>
        }
      />
      <div className="grid gap-4">
        <Card className="overflow-hidden">
          {q.isPending ? (
            <RowsSkeleton rows={2} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : (
            <ul className="divide-y divide-line">
              {q.data.map((a) => {
                const self = a.id === me.data?.id;
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0 flex-1 text-[14px]">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {a.name}
                        {self && <Badge tone="accent">You</Badge>}
                        {!a.is_active && (
                          <Badge tone="danger">Deactivated</Badge>
                        )}
                        {!a.mfa_enabled && (
                          <Badge tone="warning">Two-step not set up yet</Badge>
                        )}
                      </p>
                      <p className="text-[13px] text-muted">
                        {a.email} · last sign-in{" "}
                        {a.last_login_at
                          ? formatRelative(a.last_login_at)
                          : "never"}
                      </p>
                    </div>
                    {!self && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            if (
                              await ask(
                                `Reset ${a.name}'s password?`,
                                "They are signed out and get a temporary password to change at their next sign-in.",
                                "Reset password",
                              )
                            )
                              act.mutate({
                                id: a.id,
                                action: "reset-password",
                              });
                          }}
                        >
                          Reset password
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            if (
                              await ask(
                                `Reset ${a.name}'s two-step sign-in?`,
                                "For a lost phone. They are signed out and set up their authenticator again at the next sign-in.",
                                "Reset two-step",
                              )
                            )
                              act.mutate({ id: a.id, action: "reset-mfa" });
                          }}
                        >
                          Reset two-step
                        </Button>
                        {a.is_active ? (
                          <Button
                            size="sm"
                            variant="danger-tint"
                            onClick={async () => {
                              if (
                                await ask(
                                  `Deactivate ${a.name}?`,
                                  "They are signed out and can't sign in until reactivated.",
                                  "Deactivate",
                                )
                              )
                                act.mutate({ id: a.id, action: "deactivate" });
                            }}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              act.mutate({ id: a.id, action: "activate" })
                            }
                          >
                            Reactivate
                          </Button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <PlatformChangePassword />
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent
          title="Add platform admin"
          description="Someone on your team who runs Leadflow. Not for company users."
        >
          <form
            noValidate
            className="space-y-4 px-5 pb-5 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              create.mutate(undefined, {
                onError: (err) =>
                  setError(
                    err instanceof ApiError &&
                      err.status === 422 &&
                      err.fields.length
                      ? err.fields.map((f) => f.message).join(" ")
                      : describeError(err),
                  ),
              });
            }}
          >
            {error && <InlineAlert>{error}</InlineAlert>}
            <Field label="Name" required>
              <Input
                maxLength={300}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                maxLength={320}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={create.isPending}
                disabled={!name || !email}
              >
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {shown && (
        <ShownOnce
          open
          title="Temporary password"
          email={shown.email}
          secret={shown.secret}
          onClose={() => setShown(null)}
        />
      )}
    </>
  );
}
