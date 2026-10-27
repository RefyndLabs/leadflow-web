"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError, describeError } from "@/lib/api/errors";
import {
  platformApi,
  usePlatformAction,
  usePlatformAdmins,
  usePlatformMe,
  type PlatformAdmin,
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
import { Segmented } from "@/components/ui/segmented";
import { FreshCodeField, useFreshCode } from "./fresh-code";
import { PLATFORM_ROLE_LABEL } from "./shell";
import { ShownOnce } from "./shown-once";

type Role = PlatformAdmin["role"];

function errorText(err: unknown) {
  return err instanceof ApiError && err.status === 422 && err.fields.length
    ? err.fields.map((f) => f.message).join(" ")
    : describeError(err);
}

type CodeAction = "make-owner" | "reset-password" | "reset-mfa";

const CODE_ACTIONS: Record<
  CodeAction,
  { title: (name: string) => string; description: string; label: string }
> = {
  "make-owner": {
    title: (n) => `Make ${n} an owner?`,
    description:
      "Owners can suspend and delete organizations, reset company users' passwords, revoke automation keys and manage platform admins, including you.",
    label: "Make owner",
  },
  "reset-password": {
    title: (n) => `Reset ${n}'s password?`,
    description:
      "For a forgotten password. They are signed out and get a temporary password, which you hand to them; they choose their own at their next sign-in.",
    label: "Reset password",
  },
  "reset-mfa": {
    title: (n) => `Reset ${n}'s two-step sign-in?`,
    description:
      "For a lost phone. They are signed out and set up their authenticator again at their next sign-in.",
    label: "Reset two-step",
  },
};

/**
 * What could hand someone else's account to whoever holds your open session
 * (making an owner, resetting a password or two-step sign-in) needs your
 * fresh authenticator code.
 */
function CodeActionDialog({
  pending,
  onClose,
  onPassword,
}: {
  pending: { admin: PlatformAdmin; action: CodeAction } | null;
  onClose: () => void;
  onPassword: (r: PlatformTemporaryPassword) => void;
}) {
  const code = useFreshCode();
  const [error, setError] = React.useState<string | null>(null);
  const close = () => {
    code.reset();
    setError(null);
    onClose();
  };
  const run = usePlatformAction(
    ({ admin, action }: { admin: PlatformAdmin; action: CodeAction }) =>
      action === "make-owner"
        ? platformApi<unknown>(`/admins/${admin.id}/role`, {
            method: "PUT",
            body: { role: "owner", ...code.body() },
          })
        : platformApi<unknown>(`/admins/${admin.id}/${action}`, {
            method: "POST",
            body: code.body(),
          }),
    {
      handled: true,
      onSuccess: (data, { action }) => {
        close();
        if (action === "reset-password")
          onPassword(data as PlatformTemporaryPassword);
        else
          toast.success(
            action === "make-owner"
              ? "They are an owner now"
              : "Two-step sign-in reset",
          );
      },
    },
  );
  const meta = pending ? CODE_ACTIONS[pending.action] : null;
  return (
    <Dialog open={pending !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent
        title={meta && pending ? meta.title(pending.admin.name) : ""}
        description={meta?.description}
      >
        <form
          noValidate
          className="space-y-4 px-5 pb-5 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) return;
            setError(null);
            run.mutate(pending, {
              onError: (err) => setError(errorText(err)),
            });
          }}
        >
          {error && <InlineAlert>{error}</InlineAlert>}
          <FreshCodeField state={code} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={run.isPending}
              disabled={!code.ready}
            >
              {meta?.label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformAdmins() {
  const confirm = useConfirm();
  const me = usePlatformMe();
  const q = usePlatformAdmins();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("staff");
  const addCode = useFreshCode();
  const [pending, setPending] = React.useState<{
    admin: PlatformAdmin;
    action: CodeAction;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const isOwner = me.data?.role === "owner";
  const [shown, setShown] = React.useState<{
    email: string;
    secret: string;
  } | null>(null);

  const create = usePlatformAction(
    () =>
      platformApi<PlatformAdminCreated>("/admins", {
        method: "POST",
        body: {
          name,
          email: email.trim(),
          role,
          ...(role === "owner" ? addCode.body() : {}),
        },
      }),
    {
      handled: true,
      onSuccess: (c) => {
        setAdding(false);
        setName("");
        setEmail("");
        setRole("staff");
        addCode.reset();
        setShown({ email: c.admin.email, secret: c.temporary_password });
      },
    },
  );
  const demote = usePlatformAction(
    (id: string) =>
      platformApi<PlatformAdmin>(`/admins/${id}/role`, {
        method: "PUT",
        body: { role: "staff" },
      }),
    { success: "They are staff now" },
  );
  const act = usePlatformAction(
    ({ id, action }: { id: string; action: "activate" | "deactivate" }) =>
      platformApi<unknown>(`/admins/${id}/${action}`, { method: "POST" }),
    { success: "Done" },
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
        description={
          isOwner
            ? "People who can use this console. Each signs in with a password and an authenticator app. Owners can do everything; staff can't suspend or delete organizations, reset company users' passwords, revoke automation keys or manage platform admins."
            : "People who can use this console. Only owners can add or change platform admins."
        }
        actions={
          isOwner ? (
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Add platform admin
            </Button>
          ) : undefined
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
                        <Badge tone={a.role === "owner" ? "accent" : "neutral"}>
                          {PLATFORM_ROLE_LABEL[a.role]}
                        </Badge>
                        {self && <Badge>You</Badge>}
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
                    {!self && isOwner && (
                      <>
                        {a.role === "owner" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={async () => {
                              if (
                                await ask(
                                  `Make ${a.name} staff?`,
                                  "They keep their account but can no longer suspend or delete organizations, reset company users' passwords, revoke automation keys or manage platform admins.",
                                  "Make staff",
                                )
                              )
                                demote.mutate(a.id);
                            }}
                          >
                            Make staff
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!a.is_active}
                            onClick={() =>
                              setPending({ admin: a, action: "make-owner" })
                            }
                          >
                            Make owner
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setPending({ admin: a, action: "reset-password" })
                          }
                        >
                          Reset password
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setPending({ admin: a, action: "reset-mfa" })
                          }
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
      </div>
      <CodeActionDialog
        pending={pending}
        onClose={() => setPending(null)}
        onPassword={(r) =>
          setShown({ email: r.email, secret: r.temporary_password })
        }
      />

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
                onError: (err) => setError(errorText(err)),
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
            <Field
              label="Email"
              required
              hint="Their company email address. Other addresses are refused."
            >
              <Input
                type="email"
                maxLength={320}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Segmented<Role>
              label="Role"
              value={role}
              onValueChange={setRole}
              options={[
                { value: "staff", label: "Staff" },
                { value: "owner", label: "Owner" },
              ]}
            />
            <p className="text-[13px] text-muted">
              {role === "owner"
                ? "Owners can do everything in the console. Confirm with your authenticator code."
                : "Staff look after organizations day to day, without suspending or deleting them, resetting company users' passwords, revoking automation keys or managing platform admins."}
            </p>
            {role === "owner" && <FreshCodeField state={addCode} />}
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
                disabled={
                  !name || !email || (role === "owner" && !addCode.ready)
                }
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
