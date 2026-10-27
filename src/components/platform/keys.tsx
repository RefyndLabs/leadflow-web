"use client";

import { KeyRound } from "lucide-react";
import {
  platformApi,
  usePlatformAction,
  usePlatformKeys,
  usePlatformMe,
} from "@/lib/api/platform";
import { formatRelative } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
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

export function PlatformKeys() {
  const confirm = useConfirm();
  const q = usePlatformKeys();
  const isOwner = usePlatformMe().data?.role === "owner";
  const revoke = usePlatformAction(
    (id: string) =>
      platformApi(`/integration-keys/${id}/revoke`, { method: "POST" }),
    { success: "Key revoked" },
  );

  return (
    <>
      <PageHeader
        title="Automation keys"
        description="The master keys n8n uses to act for organizations. Only the start of each key is shown, never the key itself."
      />
      <InlineAlert tone="accent" className="mb-4">
        New keys are created only with the command line
        (create-integration-key), so a key never appears on a web page. Revoke
        one here in an emergency: it stops working at once, and n8n stops until
        it has a new key.
      </InlineAlert>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={2} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No keys"
            description="Create one with the command line."
          />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0 flex-1 text-[14px]">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <code className="font-mono">{k.key_prefix}…</code> {k.name}
                    {k.revoked_at ? (
                      <Badge tone="danger">Revoked</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </p>
                  <p className="text-[13px] text-muted">
                    Last used{" "}
                    {k.last_used_at ? formatRelative(k.last_used_at) : "never"}{" "}
                    · created {formatRelative(k.created_at)}
                    {k.allowed_ips?.length
                      ? ` · only from ${k.allowed_ips.join(", ")}`
                      : " · from any address"}
                  </p>
                </div>
                {!k.revoked_at && isOwner && (
                  <Button
                    size="sm"
                    variant="danger-tint"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Revoke ${k.key_prefix}…?`,
                          description:
                            "It stops working immediately. Every n8n workflow using it fails until it gets a new key.",
                          confirmLabel: "Revoke key",
                          destructive: true,
                        })
                      )
                        revoke.mutate(k.id);
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
