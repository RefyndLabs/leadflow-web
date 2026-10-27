"use client";

import * as React from "react";
import {
  platformApi,
  usePlatformAction,
  usePlatformMe,
  usePlatformSessions,
  type PlatformRecoveryCodes,
} from "@/lib/api/platform";
import { describeError } from "@/lib/api/errors";
import { formatRelative } from "@/lib/format";
import { Appearance } from "@/components/app/profile";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { CopyButton } from "@/components/ui/copy-button";
import {
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { FreshCodeField, useFreshCode } from "./fresh-code";
import { PLATFORM_ROLE_LABEL, PlatformChangePassword } from "./shell";

const ROLE_HELP = {
  owner:
    "You can do everything, including suspending and deleting organizations, resetting company users' passwords, revoking automation keys and managing platform admins.",
  staff:
    "You can look after organizations day to day. Suspending or deleting an organization, resetting a company user's password, revoking automation keys and managing platform admins are for owners.",
} as const;

function Account() {
  const me = usePlatformMe();
  if (!me.data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your account</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2 text-[14px]">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {me.data.name}
          <Badge tone={me.data.role === "owner" ? "accent" : "neutral"}>
            {PLATFORM_ROLE_LABEL[me.data.role]}
          </Badge>
        </p>
        <p className="text-muted">{me.data.email}</p>
        <p className="text-muted">{ROLE_HELP[me.data.role]}</p>
      </CardBody>
    </Card>
  );
}

function TwoStep() {
  const me = usePlatformMe();
  const code = useFreshCode();
  const [error, setError] = React.useState<string | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const replace = usePlatformAction(
    () =>
      platformApi<PlatformRecoveryCodes>("/auth/recovery-codes", {
        method: "POST",
        body: { code: code.value.trim() },
      }),
    {
      handled: true,
      onSuccess: (r) => {
        code.reset();
        setCodes(r.recovery_codes);
      },
    },
  );
  const left = me.data?.recovery_codes_left ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-step sign-in</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4 text-[14px]">
        <p>
          <Badge tone="success">On</Badge>{" "}
          <span className="text-muted">
            {left} of 10 recovery codes left. Each lets you sign in once without
            your phone.
          </span>
        </p>
        {codes ? (
          <div className="space-y-3">
            <InlineAlert tone="warning">
              Your new recovery codes, shown only now. The old ones no longer
              work. Save these in a password manager.
            </InlineAlert>
            <ul className="grid grid-cols-2 gap-2 rounded-[10px] bg-surface-2 p-3 font-mono text-[14px]">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-between gap-2">
              <CopyButton value={codes.join("\n")} label="Copy all codes" />
              <Button variant="secondary" onClick={() => setCodes(null)}>
                I have saved them
              </Button>
            </div>
          </div>
        ) : (
          <form
            noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              replace.mutate(undefined, {
                onError: (err) => setError(describeError(err)),
              });
            }}
          >
            <p className="text-muted">
              Used some, or lost the list? Make ten new ones. The old ones stop
              working.
            </p>
            {error && <InlineAlert>{error}</InlineAlert>}
            <FreshCodeField state={code} allowRecovery={false} />
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="secondary"
                loading={replace.isPending}
                disabled={!code.ready}
              >
                Make new recovery codes
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

/** "Chrome on Windows"-ish, without a user-agent library. */
function describeDevice(ua: string | null | undefined) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}

function Sessions() {
  const confirm = useConfirm();
  const q = usePlatformSessions();
  const endOthers = usePlatformAction(
    () => platformApi("/auth/sessions/end-others", { method: "POST" }),
    { success: "Signed out everywhere else" },
  );
  const others = q.data?.filter((s) => !s.current).length ?? 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Where you are signed in</CardTitle>
      </CardHeader>
      {q.isPending ? (
        <RowsSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <ul className="divide-y divide-line text-[14px]">
            {q.data.map((s) => (
              <li key={s.id} className="px-4 py-3 sm:px-5">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {describeDevice(s.user_agent)}
                  {s.current && <Badge tone="accent">This device</Badge>}
                </p>
                <p className="text-[13px] text-muted">
                  {s.ip_address ?? "unknown address"} · signed in{" "}
                  {formatRelative(s.created_at)} · last active{" "}
                  {formatRelative(s.last_used_at)}
                </p>
              </li>
            ))}
          </ul>
          <CardBody className="flex justify-end border-t border-line">
            <Button
              variant="danger-tint"
              disabled={others === 0}
              loading={endOthers.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Sign out everywhere else?",
                    description:
                      "Every other session ends now. This one stays signed in.",
                    confirmLabel: "Sign out others",
                    destructive: true,
                  })
                )
                  endOthers.mutate(undefined);
              }}
            >
              Sign out everywhere else
            </Button>
          </CardBody>
        </>
      )}
    </Card>
  );
}

export function PlatformSettings() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your own account in the platform console."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Account />
          <Appearance />
          <TwoStep />
        </div>
        <div className="grid content-start gap-4">
          <PlatformChangePassword />
          <Sessions />
        </div>
      </div>
    </>
  );
}
