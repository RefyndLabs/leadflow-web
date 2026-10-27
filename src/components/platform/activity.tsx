"use client";

import { History } from "lucide-react";
import { usePlatformAudit, type PlatformAuditEntry } from "@/lib/api/platform";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/ui/feedback";

const LABELS: Record<string, string> = {
  "platform.login": "Signed in",
  "platform.logout": "Signed out",
  "platform.login_failed": "Wrong password",
  "platform.login_rejected":
    "Sign-in refused (locked, deactivated or not a company email)",
  "platform.mfa_failed": "Wrong two-step code",
  "platform.mfa_enabled": "Set up two-step sign-in",
  "platform.recovery_code_used": "Used a recovery code",
  "platform.account_locked": "Account locked after failed attempts",
  "platform.password_changed": "Changed their password",
  "platform.recovery_codes_replaced": "Made new recovery codes",
  "platform.other_sessions_ended": "Signed out everywhere else",
  "platform.admin_created": "Added a platform admin",
  "platform.admin_activated": "Reactivated a platform admin",
  "platform.admin_deactivated": "Deactivated a platform admin",
  "platform.admin_password_reset": "Reset a platform admin's password",
  "platform.admin_mfa_reset": "Reset a platform admin's two-step sign-in",
  "platform.admin_role_changed": "Changed a platform admin's role",
  "platform.org_created": "Created the organization",
  "platform.org_suspended": "Suspended the organization",
  "platform.org_activated": "Reactivated the organization",
  "platform.org_deletion_scheduled": "Scheduled the organization's deletion",
  "platform.org_deletion_cancelled": "Cancelled the organization's deletion",
  "platform.org_deleted": "Deleted the organization",
  "platform.org_integration_enabled": "Switched automation on",
  "platform.org_integration_disabled": "Switched automation off",
  "platform.org_notifications_updated": "Changed notification emails",
  "platform.org_whatsapp_set": "Set WhatsApp",
  "platform.org_whatsapp_cleared": "Removed WhatsApp",
  "platform.user_unlocked": "Unlocked a user",
  "platform.user_password_reset": "Reset a user's password",
  "platform.integration_key_revoked": "Revoked an automation key",
};

export function describeAction(a: PlatformAuditEntry): string {
  const label = LABELS[a.action] ?? a.action;
  const details = (a.details ?? {}) as Record<string, unknown>;
  const who = typeof details.email === "string" ? ` (${details.email})` : "";
  const role = typeof details.to === "string" ? ` → ${details.to}` : "";
  const org = a.target_org_slug ? ` · ${a.target_org_slug}` : "";
  return `${label}${who}${role}${org}`;
}

export function PlatformActivity() {
  const q = usePlatformAudit();
  return (
    <>
      <PageHeader
        title="Activity log"
        description="Everything done in the console, newest first. It can't be edited or deleted. Actions on an organization also appear in that organization's own audit log."
      />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nothing yet"
            description="Actions show up here as they happen."
          />
        ) : (
          <ul className="divide-y divide-line text-[14px]">
            {q.data.map((a) => (
              <li key={a.id} className="px-4 py-2.5 sm:px-5">
                {describeAction(a)}
                <span className="block text-[13px] text-muted">
                  {a.admin_email ?? "system"} · {formatDateTime(a.occurred_at)}
                  {a.ip_address ? ` · ${a.ip_address}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
