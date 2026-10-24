"use client";

import * as React from "react";
import { ApiError, describeError } from "@/lib/api/errors";
import {
  platformApi,
  usePlatformAction,
  usePlatformAudit,
  usePlatformOrg,
  usePlatformOrgUsers,
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
import { ShownOnce } from "./shown-once";

function errorText(err: unknown) {
  return err instanceof ApiError && err.status === 422 && err.fields.length
    ? err.fields.map((f) => f.message).join(" ")
    : describeError(err);
}

function StatusCard({ org }: { org: PlatformOrgDetail }) {
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
        {org.is_active ? (
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
            Reactivate organization
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
      </div>
    </>
  );
}
