"use client";

import { UserX } from "lucide-react";
import { ignoredSenders } from "@/lib/api/hooks";
import { formatPhone, formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { useAuth } from "./auth";
import { PageHeader } from "./page-header";

/** People the intake automation judged not to be buyers. Un-ignoring one means
 * their next message is judged afresh and can become a lead. */
export function IgnoredSenders() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const q = ignoredSenders.useList({ limit: 200 });
  const remove = ignoredSenders.useRemove({
    success: "Their next message will be treated as a possible enquiry",
  });
  const canWrite = can("leads:write");

  return (
    <>
      <PageHeader
        title="Ignored senders"
        description="People who wrote in but were judged not to be buyers (wrong numbers, spam, couriers, job seekers). Their messages don't become leads."
      />
      <InlineAlert tone="accent" className="mb-4">
        If someone here is a real customer, un-ignore them: their next message
        is judged again and can become a lead. People nobody has heard from in
        six months drop off this list automatically.
      </InlineAlert>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={4} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={UserX}
            title="Nobody is ignored"
            description="When the automation decides a message isn't from a potential buyer, the sender shows up here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.items.map((s) => {
              const who =
                s.channel === "whatsapp" ? formatPhone(s.address) : s.address;
              return (
                <li
                  key={s.id}
                  className="flex items-start gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px]">
                      <span className="font-medium">{who}</span>{" "}
                      <span className="text-[13px] text-muted">
                        · {s.channel === "email" ? "Email" : "WhatsApp"} ·{" "}
                        {s.message_count} message
                        {s.message_count === 1 ? "" : "s"} · last{" "}
                        {formatRelative(s.last_message_at)}
                      </span>
                    </p>
                    {s.reason && (
                      <p className="mt-1 text-[13px]">Why: {s.reason}</p>
                    )}
                    {s.snippet && (
                      <p className="mt-1 line-clamp-2 text-[13px] text-muted">
                        “{s.snippet}”
                      </p>
                    )}
                  </div>
                  {canWrite && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `Un-ignore ${who}?`,
                            description:
                              "Their next message is judged again and can become a lead.",
                            confirmLabel: "Un-ignore",
                          })
                        )
                          remove.mutate(s.id);
                      }}
                    >
                      Un-ignore
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
