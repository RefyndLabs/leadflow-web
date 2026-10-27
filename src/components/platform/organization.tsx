"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, describeError } from "@/lib/api/errors";
import {
  platformApi,
  usePlatformAction,
  usePlatformAudit,
  usePlatformMe,
  usePlatformOrg,
  usePlatformOrgUsers,
  type PlatformOrgDeleted,
  type PlatformOrgDetail,
  type PlatformTemporaryPassword,
} from "@/lib/api/platform";
import { formatDateTime, formatRelative } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/enums";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  ErrorState,
  InlineAlert,
  RowsSkeleton,
  Skeleton,
} from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, PasswordInput } from "@/components/ui/input";
import { describeAction } from "./activity";
import { FreshCodeField, useFreshCode } from "./fresh-code";
import { ShownOnce } from "./shown-once";

function errorText(err: unknown) {
  return err instanceof ApiError && err.status === 422 && err.fields.length
    ? err.fields.map((f) => f.message).join(" ")
    : describeError(err);
}

function useIsOwner() {
  return usePlatformMe().data?.role === "owner";
}

function StatusCard({ org }: { org: PlatformOrgDetail }) {
  const isOwner = useIsOwner();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const suspend = usePlatformAction(
    () =>
      platformApi(`/organizations/${org.slug}/suspend`, {
        method: "POST",
        body: { confirm_slug: typed },
      }),
    {
      success: `${org.name} is suspended`,
      onSuccess: () => {
        setOpen(false);
        setTyped("");
      },
    },
  );
  const activate = usePlatformAction(
    () =>
      platformApi(`/organizations/${org.slug}/activate`, { method: "POST" }),
    { success: `${org.name} is active again` },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-[14px]">
        <p className="flex items-center gap-2">
          {org.is_active ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="danger">Suspended</Badge>
          )}
          <span className="text-muted">
            {org.users_active} of {org.users_total} users active ·{" "}
            {org.leads_total} leads · created {formatRelative(org.created_at)}
          </span>
        </p>
        {!isOwner ? (
          <p className="text-muted">
            Only an owner can suspend, reactivate or delete an organization.
          </p>
        ) : org.is_active ? (
          <>
            <p className="text-muted">
              Suspending signs everyone out at once and blocks their logins and
              keys. Their data stays as it is.
            </p>
            <Button variant="danger-tint" onClick={() => setOpen(true)}>
              Suspend organization
            </Button>
          </>
        ) : (
          <Button
            loading={activate.isPending}
            onClick={() => activate.mutate(undefined)}
          >
            {org.deletion_due_at
              ? "Reactivate (cancels the deletion)"
              : "Reactivate organization"}
          </Button>
        )}
      </CardBody>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Suspend ${org.name}?`}
          description="Everyone is signed out and can't sign in until you reactivate it."
        >
          <div className="space-y-4 px-5 pb-5 pt-3">
            <Field label={`Type ${org.slug} to confirm`} required>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={typed.trim().toLowerCase() !== org.slug}
                loading={suspend.isPending}
                onClick={() => suspend.mutate(undefined)}
              >
                Suspend
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Deleting, for owners: suspend first, then schedule (slug + fresh code), then
 * after the 7-day wait confirm (slug + fresh code again). Any owner can cancel
 * until then; the database refuses an early deletion whatever the page does.
 */
function DeletionCard({ org }: { org: PlatformOrgDetail }) {
  const router = useRouter();
  const confirm = useConfirm();
  const code = useFreshCode();
  const [open, setOpen] = React.useState<"schedule" | "delete" | null>(null);
  const [typed, setTyped] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const close = () => {
    setOpen(null);
    setTyped("");
    setError(null);
    code.reset();
  };
  const schedule = usePlatformAction(
    () =>
      platformApi(`/organizations/${org.slug}/deletion`, {
        method: "POST",
        body: { confirm_slug: typed, ...code.body() },
      }),
    { handled: true, success: "Deletion scheduled", onSuccess: close },
  );
  const cancel = usePlatformAction(
    () =>
      platformApi(`/organizations/${org.slug}/deletion`, { method: "DELETE" }),
    { success: "Deletion cancelled" },
  );
  const remove = usePlatformAction(
    () =>
      platformApi<PlatformOrgDeleted>(`/organizations/${org.slug}/delete`, {
        method: "POST",
        body: { confirm_slug: typed, ...code.body() },
      }),
    {
      handled: true,
      onSuccess: () => {
        close();
        toast.success(`${org.name} is deleted`);
        router.replace("/platform");
      },
    },
  );

  const due = org.deletion_due_at ? new Date(org.deletion_due_at) : null;
  // When the page was opened; the API decides for real anyway.
  const [openedAt] = React.useState(() => Date.now());
  const isDue = due !== null && due.getTime() <= openedAt;
  const action = open === "delete" ? remove : schedule;

  return (
    <Card className="border-danger/40 lg:col-span-2">
      <CardHeader>
        <CardTitle>Delete organization</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-[14px]">
        {org.is_active ? (
          <p className="text-muted">
            To delete it, suspend it first. Then schedule the deletion: it can
            be carried out 7 days later, and any owner can cancel until then.
          </p>
        ) : !due ? (
          <>
            <p className="text-muted">
              Deleting removes the organization and all its data for good: its
              users, leads, messages, files and its own audit log. It can be
              carried out 7 days after you schedule it. Older backups keep the
              data until they expire.
            </p>
            <Button variant="danger-tint" onClick={() => setOpen("schedule")}>
              Schedule deletion
            </Button>
          </>
        ) : (
          <>
            <InlineAlert tone="warning">
              Scheduled by {org.deletion_scheduled_by ?? "an owner"}
              {org.deletion_scheduled_at
                ? ` ${formatRelative(org.deletion_scheduled_at)}`
                : ""}
              .{" "}
              {isDue
                ? "The waiting period is over: an owner can delete it now."
                : `It can be deleted from ${formatDateTime(org.deletion_due_at!)}.`}
            </InlineAlert>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={cancel.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Cancel the deletion?",
                      description:
                        "The organization stays suspended. Scheduling again starts a new 7-day wait.",
                      confirmLabel: "Cancel deletion",
                    })
                  )
                    cancel.mutate(undefined);
                }}
              >
                Cancel deletion
              </Button>
              <Button
                variant="danger"
                disabled={!isDue}
                onClick={() => setOpen("delete")}
              >
                Delete permanently
              </Button>
            </div>
          </>
        )}
      </CardBody>
      <Dialog open={open !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent
          title={
            open === "delete"
              ? `Delete ${org.name} permanently?`
              : `Schedule ${org.name} for deletion?`
          }
          description={
            open === "delete"
              ? "Everything it owns is deleted now. This can't be undone."
              : "It stays suspended, and can be deleted 7 days from now. Any owner can cancel until then."
          }
        >
          <form
            noValidate
            className="space-y-4 px-5 pb-5 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              action.mutate(undefined, {
                onError: (err) => setError(errorText(err)),
              });
            }}
          >
            {error && <InlineAlert>{error}</InlineAlert>}
            <Field label={`Type ${org.slug} to confirm`} required>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
            </Field>
            <FreshCodeField state={code} />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={
                  typed.trim().toLowerCase() !== org.slug || !code.ready
                }
                loading={action.isPending}
              >
                {open === "delete" ? "Delete permanently" : "Schedule deletion"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AutomationCard({ org }: { org: PlatformOrgDetail }) {
  const confirm = useConfirm();
  const toggle = usePlatformAction(
    (enabled: boolean) =>
      platformApi(`/organizations/${org.slug}/integration`, {
        method: "PUT",
        body: { enabled },
      }),
    { success: "Saved" },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Automation (n8n)</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3 text-[14px]">
        <p>
          {org.integration_enabled ? (
            <Badge tone="accent">On</Badge>
          ) : (
            <Badge>Off</Badge>
          )}{" "}
          <span className="text-muted">
            When on, the automation key may act for this organization: intake,
            follow-ups, the WhatsApp bot, show-capture reading.
          </span>
        </p>
        <Button
          variant={org.integration_enabled ? "secondary" : "primary"}
          loading={toggle.isPending}
          onClick={async () => {
            if (
              org.integration_enabled &&
              !(await confirm({
                title: "Switch automation off?",
                description:
                  "Incoming messages and follow-ups stop being handled for this organization.",
                confirmLabel: "Switch off",
                destructive: true,
              }))
            )
              return;
            toggle.mutate(!org.integration_enabled);
          }}
        >
          {org.integration_enabled ? "Switch off" : "Switch on"}
        </Button>
      </CardBody>
    </Card>
  );
}

function NotificationsCard({ org }: { org: PlatformOrgDetail }) {
  const [values, setValues] = React.useState({
    error_alert_email: org.error_alert_email ?? "",
    exhibition_reviewer_email: org.exhibition_reviewer_email ?? "",
    handoff_email: org.handoff_email ?? "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const save = usePlatformAction(
    (body: Record<string, string | null>) =>
      platformApi(`/organizations/${org.slug}/notifications`, {
        method: "PATCH",
        body,
      }),
    { success: "Notification emails saved", handled: true },
  );
  const fields = [
    [
      "error_alert_email",
      "Problems and failures",
      "When an automation fails for them.",
    ],
    [
      "exhibition_reviewer_email",
      "Show leads to review",
      "Business cards waiting for a check.",
    ],
    [
      "handoff_email",
      "Bot hand-offs",
      "When the WhatsApp bot hands a conversation to a person.",
    ],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification emails</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate(
              Object.fromEntries(
                Object.entries(values).map(([k, v]) => [k, v.trim() || null]),
              ),
              { onError: (err) => setError(errorText(err)) },
            );
          }}
        >
          {error && <InlineAlert>{error}</InlineAlert>}
          {fields.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <Input
                type="email"
                maxLength={320}
                value={values[key]}
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
            </Field>
          ))}
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function WhatsAppCard({ org }: { org: PlatformOrgDetail }) {
  const confirm = useConfirm();
  const [phoneId, setPhoneId] = React.useState(
    org.whatsapp_phone_number_id ?? "",
  );
  const [token, setToken] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const set = usePlatformAction(
    () =>
      platformApi(`/organizations/${org.slug}/whatsapp`, {
        method: "PUT",
        body: { phone_number_id: phoneId.trim(), access_token: token.trim() },
      }),
    { success: "WhatsApp saved", handled: true, onSuccess: () => setToken("") },
  );
  const clear = usePlatformAction(
    () =>
      platformApi(`/organizations/${org.slug}/whatsapp`, { method: "DELETE" }),
    { success: "WhatsApp removed", onSuccess: () => setPhoneId("") },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 text-[14px]">
        <p>
          {org.whatsapp_configured ? (
            <Badge tone="success">Set</Badge>
          ) : (
            <Badge>Not set</Badge>
          )}{" "}
          {org.whatsapp_phone_number_id && (
            <span className="text-muted">
              Phone number ID {org.whatsapp_phone_number_id}
            </span>
          )}
        </p>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            set.mutate(undefined, {
              onError: (err) => setError(errorText(err)),
            });
          }}
        >
          {error && <InlineAlert>{error}</InlineAlert>}
          <Field
            label="Phone number ID"
            required
            hint="The number Meta shows under WhatsApp → API setup (digits only), not the phone number."
          >
            <Input
              inputMode="numeric"
              maxLength={30}
              value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
            />
          </Field>
          <Field
            label="Access token"
            required
            hint="A permanent system-user token (starts with EAA). Stored encrypted and never shown again."
          >
            <PasswordInput
              autoComplete="off"
              maxLength={1000}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            {org.whatsapp_configured && (
              <Button
                type="button"
                variant="danger-tint"
                loading={clear.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Remove WhatsApp?",
                      description:
                        "Messages can't be sent or routed for this organization until it is set again.",
                      confirmLabel: "Remove",
                      destructive: true,
                    })
                  )
                    clear.mutate(undefined);
                }}
              >
                Remove
              </Button>
            )}
            <Button
              type="submit"
              loading={set.isPending}
              disabled={!phoneId.trim() || token.trim().length < 20}
            >
              {org.whatsapp_configured ? "Replace" : "Save"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function UsersCard({ org }: { org: PlatformOrgDetail }) {
  const confirm = useConfirm();
  const isOwner = useIsOwner();
  const q = usePlatformOrgUsers(org.slug);
  const [shown, setShown] = React.useState<PlatformTemporaryPassword | null>(
    null,
  );
  const unlock = usePlatformAction(
    (id: string) =>
      platformApi(`/organizations/${org.slug}/users/${id}/unlock`, {
        method: "POST",
      }),
    { success: "Unlocked" },
  );
  const reset = usePlatformAction(
    (id: string) =>
      platformApi<PlatformTemporaryPassword>(
        `/organizations/${org.slug}/users/${id}/reset-password`,
        { method: "POST" },
      ),
    { onSuccess: (r) => setShown(r) },
  );

  return (
    <Card className="overflow-hidden lg:col-span-2">
      <CardHeader>
        <CardTitle>Users</CardTitle>
      </CardHeader>
      {q.isPending ? (
        <RowsSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
            >
              <div className="min-w-0 flex-1 text-[14px]">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {u.name}
                  <Badge>{ROLE_LABEL[u.role]}</Badge>
                  {!u.is_active && <Badge tone="danger">Deactivated</Badge>}
                  {u.locked && <Badge tone="warning">Locked</Badge>}
                  {u.must_change_password && (
                    <Badge tone="accent">Temporary password</Badge>
                  )}
                </p>
                <p className="text-[13px] text-muted">
                  {u.email} · last sign-in{" "}
                  {u.last_login_at ? formatRelative(u.last_login_at) : "never"}
                </p>
              </div>
              {u.locked && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => unlock.mutate(u.id)}
                >
                  Unlock
                </Button>
              )}
              {isOwner && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Reset ${u.name}'s password?`,
                        description:
                          "They are signed out everywhere and get a temporary password, which you hand to them. They choose a new one at their next sign-in.",
                        confirmLabel: "Reset password",
                        destructive: true,
                      })
                    )
                      reset.mutate(u.id);
                  }}
                >
                  Reset password
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {shown && (
        <ShownOnce
          open
          title="Temporary password"
          email={shown.email}
          secret={shown.temporary_password}
          onClose={() => setShown(null)}
        />
      )}
    </Card>
  );
}

function RecentActivity({ slug }: { slug: string }) {
  const q = usePlatformAudit(slug);
  return (
    <Card className="overflow-hidden lg:col-span-2">
      <CardHeader>
        <CardTitle>Recent platform activity</CardTitle>
      </CardHeader>
      {q.isPending ? (
        <RowsSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <CardBody className="text-[14px] text-muted">Nothing yet.</CardBody>
      ) : (
        <ul className="divide-y divide-line text-[14px]">
          {q.data.slice(0, 15).map((a) => (
            <li key={a.id} className="px-4 py-2.5 sm:px-5">
              {describeAction(a)}{" "}
              <span className="text-[13px] text-muted">
                · {a.admin_email ?? "system"} · {formatDateTime(a.occurred_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PlatformOrganization({ slug }: { slug: string }) {
  const q = usePlatformOrg(slug);
  const me = usePlatformMe();
  if (q.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-[14px]" />
      </div>
    );
  if (q.isError)
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const org = q.data;
  const isOwner = me.data?.role === "owner";
  return (
    <>
      <PageHeader
        back={{ href: "/platform", label: "Organizations" }}
        title={org.name}
        description={`Short name: ${org.slug}`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <StatusCard org={org} />
        <AutomationCard org={org} />
        <NotificationsCard key={`n-${org.id}`} org={org} />
        <WhatsAppCard key={`w-${org.id}`} org={org} />
        <UsersCard org={org} />
        <RecentActivity slug={org.slug} />
        {isOwner && <DeletionCard org={org} />}
      </div>
    </>
  );
}
