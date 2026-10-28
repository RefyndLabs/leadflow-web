"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Mail, Plus, RefreshCw } from "lucide-react";
import {
  useConnectGmail,
  useDisconnectMailbox,
  useMailboxes,
  useUpdateMailbox,
} from "@/lib/api/hooks";
import type { Mailbox } from "@/lib/api/types";
import { formatDate, formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/input";
import { useAuth } from "./auth";
import { PageHeader } from "./page-header";

/** Why a connection didn't finish: the `error` code the API's OAuth callback sends back to this page. */
const CONNECT_ERRORS: Record<string, string> = {
  denied: "You cancelled on Google's screen, so nothing was connected.",
  expired:
    "The connection took too long or the link was already used. Please try again.",
  forbidden: "Only an admin of an active workspace can connect a mailbox.",
  google: "Google didn't finish the connection. Please try again.",
  scopes:
    "Neither reading nor sending was allowed on Google's screen. Connect again and allow both.",
  in_use: "That mailbox is already connected to another Leadflow workspace.",
};

/** Gmail's inbox tabs that can be left out (Primary is always read). */
const CATEGORIES = [
  { value: "promotions", label: "Promotions" },
  { value: "social", label: "Social" },
  { value: "forums", label: "Forums" },
  { value: "updates", label: "Updates" },
] as const;

/** Reads `?connected=` / `?error=` once, then clears them so a reload doesn't show the notice again. */
function useConnectResult() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [result] = React.useState(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected)
      return { tone: "success" as const, text: `Connected ${connected}.` };
    if (error)
      return {
        tone: "danger" as const,
        text: CONNECT_ERRORS[error] ?? CONNECT_ERRORS.google!,
      };
    return null;
  });
  React.useEffect(() => {
    if (params.has("connected") || params.has("error"))
      router.replace(pathname, { scroll: false });
  }, [params, router, pathname]);
  return result;
}

function MailboxRow({
  mailbox,
  canWrite,
  onReconnect,
  reconnecting,
}: {
  mailbox: Mailbox;
  canWrite: boolean;
  onReconnect: () => void;
  reconnecting: boolean;
}) {
  const confirm = useConfirm();
  const update = useUpdateMailbox();
  const disconnect = useDisconnectMailbox();
  const needsReconnect = mailbox.status === "needs_reconnect";
  const missing = [
    !mailbox.can_receive && "reading",
    !mailbox.can_send && "sending",
  ].filter(Boolean);

  const setSkipped = (value: string, skip: boolean) => {
    const next = skip
      ? [...mailbox.skip_categories, value]
      : mailbox.skip_categories.filter((c) => c !== value);
    update.mutate({ id: mailbox.id, skip_categories: next });
  };

  return (
    <li className="space-y-4 px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
            <span className="break-all">{mailbox.email_address}</span>
            {needsReconnect ? (
              <Badge tone="warning" dot>
                Needs reconnecting
              </Badge>
            ) : (
              <Badge tone="success" dot>
                Connected
              </Badge>
            )}
            {mailbox.is_default_sender && (
              <Badge tone="accent">Sends from here</Badge>
            )}
          </p>
          <p className="text-[13px] text-muted">
            Gmail · connected {formatDate(mailbox.created_at)} ·{" "}
            {mailbox.last_synced_at
              ? `last checked ${formatRelative(mailbox.last_synced_at)}`
              : "not checked yet"}
          </p>
        </div>
        {canWrite && (
          <Button
            variant="danger-tint"
            size="sm"
            loading={disconnect.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: `Disconnect ${mailbox.email_address}?`,
                  description:
                    "Leadflow stops reading new enquiries from it and can't send from it, and its access at Google is withdrawn. Leads already created stay. You can connect it again later.",
                  confirmLabel: "Disconnect",
                  destructive: true,
                })
              )
                disconnect.mutate(mailbox.id);
            }}
          >
            Disconnect
          </Button>
        )}
      </div>

      {needsReconnect && (
        <InlineAlert
          tone="warning"
          className="flex flex-wrap items-start gap-2"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Google stopped accepting Leadflow&apos;s access (the password may
            have changed or access was removed), so nothing is being read or
            sent.
            {mailbox.last_error && (
              <span className="block text-[13px] opacity-80">
                {mailbox.last_error}
              </span>
            )}
          </span>
          {canWrite && (
            <Button size="sm" loading={reconnecting} onClick={onReconnect}>
              <RefreshCw aria-hidden />
              Reconnect
            </Button>
          )}
        </InlineAlert>
      )}
      {!needsReconnect && missing.length > 0 && (
        <InlineAlert tone="warning">
          {missing.join(" and ").replace(/^./, (c) => c.toUpperCase())}{" "}
          wasn&apos;t allowed on Google&apos;s screen.{" "}
          {canWrite && "Reconnect and allow both to use it fully."}
        </InlineAlert>
      )}
      {!needsReconnect && missing.length === 0 && mailbox.last_error && (
        <p className="text-[13px] text-muted">
          Last problem {formatRelative(mailbox.last_error_at)}:{" "}
          {mailbox.last_error}
        </p>
      )}

      <div className="space-y-3 rounded-[12px] border border-line p-3 sm:p-4">
        <label className="flex items-start gap-3 text-[14px]">
          <Checkbox
            className="mt-0.5"
            checked={mailbox.receive_enabled}
            disabled={!canWrite || !mailbox.can_receive || update.isPending}
            onChange={(e) =>
              update.mutate({
                id: mailbox.id,
                receive_enabled: e.target.checked,
              })
            }
          />
          <span>
            <span className="block font-medium">
              Turn new emails into leads
            </span>
            <span className="block text-[13px] text-muted">
              Only mail that arrives after connecting is read. Turn this off to
              keep sending from this address without reading its inbox.
            </span>
          </span>
        </label>
        {mailbox.receive_enabled && mailbox.can_receive && (
          <fieldset className="pl-8">
            <legend className="text-[13px] font-medium">
              Skip these Gmail tabs
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
              {CATEGORIES.map((c) => (
                <label
                  key={c.value}
                  className="flex min-h-9 items-center gap-2 text-[14px]"
                >
                  <Checkbox
                    checked={mailbox.skip_categories.includes(c.value)}
                    disabled={!canWrite || update.isPending}
                    onChange={(e) => setSkipped(c.value, e.target.checked)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>

      {canWrite &&
        !mailbox.is_default_sender &&
        mailbox.can_send &&
        !needsReconnect && (
          <Button
            variant="outline"
            size="sm"
            loading={update.isPending}
            onClick={() =>
              update.mutate({ id: mailbox.id, is_default_sender: true })
            }
          >
            Send from this mailbox
          </Button>
        )}
    </li>
  );
}

export function EmailSettings() {
  const { can } = useAuth();
  const canWrite = can("org:write");
  const q = useMailboxes();
  const connect = useConnectGmail();
  const result = useConnectResult();
  const connectButton = (label: string) => (
    <Button loading={connect.isPending} onClick={() => connect.mutate()}>
      <Plus aria-hidden />
      {label}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Email"
        description="Connect your company's mailbox so enquiries that arrive there become leads, and replies and follow-ups go from your own address."
        actions={
          canWrite && q.data && q.data.length > 0
            ? connectButton("Connect another")
            : undefined
        }
      />
      <div className="grid max-w-3xl gap-4">
        {result && <InlineAlert tone={result.tone}>{result.text}</InlineAlert>}
        <Card className="overflow-hidden">
          {q.isPending ? (
            <RowsSkeleton rows={2} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          ) : q.data.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No mailbox connected"
              description={
                canWrite
                  ? "Connect the Gmail account your buyers write to. You'll sign in with Google and allow Leadflow to read new mail and send on your behalf."
                  : "An admin can connect the company's Gmail account here."
              }
              action={canWrite ? connectButton("Connect Gmail") : undefined}
            />
          ) : (
            <ul className="divide-y divide-line">
              {q.data.map((m) => (
                <MailboxRow
                  key={m.id}
                  mailbox={m}
                  canWrite={canWrite}
                  onReconnect={() => connect.mutate()}
                  reconnecting={connect.isPending}
                />
              ))}
            </ul>
          )}
        </Card>
        {canWrite && (
          <div className="space-y-2 text-[13px] text-muted">
            <p>
              Google may warn that Leadflow isn&apos;t verified yet. Choose{" "}
              <strong>Advanced</strong>, then <strong>Go to Leadflow</strong>,
              to continue.
            </p>
            <p>
              Emails that can&apos;t be matched to a lead automatically go to
              the handoff email in{" "}
              <Link
                href="/settings/organization"
                className="text-accent underline underline-offset-2"
              >
                Organization settings
              </Link>
              . You can remove Leadflow&apos;s access at any time here or in
              your Google account.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
