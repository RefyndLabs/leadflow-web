"use client";

import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";
import type { DuplicateCheck } from "@/lib/api/types";
import { CAPTURE_LABEL } from "@/lib/enums";
import { formatPhone, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/feedback";
import { StatusBadge } from "./badges";
import { UserName } from "./entities";

export type Resolution = { kind: "new" } | { kind: "attach"; leadId: string };

/**
 * What confirm should do: the person's explicit choice while it still applies, otherwise the API's
 * recommendation. Null only when an attach is recommended without a lead to attach to.
 */
export function effectiveResolution(
  dup: DuplicateCheck | null | undefined,
  choice: Resolution | null,
): Resolution | null {
  const open = dup?.contact ? (dup.open_leads ?? []) : [];
  if (open.length === 0) return { kind: "new" };
  if (choice?.kind === "new") return choice;
  if (choice?.kind === "attach" && open.some((l) => l.id === choice.leadId)) return choice;
  if (dup!.recommended_resolution === "attach") {
    const id = dup!.recommended_lead_id;
    return id && open.some((l) => l.id === id) ? { kind: "attach", leadId: id } : null;
  }
  return { kind: "new" };
}

const MATCHED: Record<string, string> = { phone: "phone", email: "email", whatsapp: "WhatsApp" };

export function DuplicatesPanel({
  dup,
  resolution,
  onChoose,
  disabled,
  choiceMissing,
  checking,
}: {
  dup: DuplicateCheck | null | undefined;
  resolution: Resolution | null;
  onChoose: (r: Resolution) => void;
  disabled?: boolean;
  choiceMissing?: boolean;
  checking?: boolean;
}) {
  if (!dup) return null;
  const open = dup.contact ? (dup.open_leads ?? []) : [];
  const others = dup.other_captures ?? [];
  const similar = dup.similar_contacts ?? [];
  const matchedOn = (dup.matched_on ?? []).map((m) => MATCHED[m] ?? m);

  return (
    <div className="space-y-3" aria-busy={checking || undefined}>
      {dup.contact && (
        <Card className={cn(dup.is_likely_duplicate && "border-accent")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden />
              We already know this person
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3 pt-2">
            <p className="text-[14px]">
              Already in your contacts:{" "}
              <Link href={`/contacts/${dup.contact.id}`} className="font-medium hover:underline">
                {dup.contact.name}
              </Link>
              {matchedOn.length > 0 && <span className="text-muted"> (matched on {matchedOn.join(" and ")})</span>}
              <span className="block text-[13px] text-muted">
                {[dup.contact.phone ? formatPhone(dup.contact.phone) : null, dup.contact.email].filter(Boolean).join(" · ")}
              </span>
            </p>
            {dup.conflicting_contact && (
              <InlineAlert tone="warning">
                Another contact also matches: <span className="font-medium">{dup.conflicting_contact.name}</span>. Check
                the phone and email before confirming.
              </InlineAlert>
            )}
            {open.length === 0 ? (
              <p className="text-[13px] text-muted">No open enquiry, so confirming starts a new one for them.</p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-[14px] font-medium">They have an open enquiry. What is this?</legend>
                {open.map((l) => {
                  const selected = resolution?.kind === "attach" && resolution.leadId === l.id;
                  return (
                    <label
                      key={l.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-[12px] border p-3.5",
                        selected ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
                      )}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        className="mt-1 size-4 accent-[var(--accent)]"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => onChoose({ kind: "attach", leadId: l.id })}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                          Add to this lead: “{l.title ?? "Untitled lead"}” <StatusBadge status={l.status} />
                        </span>
                        {l.requirement_summary && (
                          <span className="mt-0.5 block text-[13px] text-muted">{l.requirement_summary}</span>
                        )}
                        {l.last_touchpoints.slice(0, 2).map((t, i) => (
                          <span key={i} className="mt-1 block truncate text-[13px] text-muted">
                            {t.direction === "inbound" ? "They: " : "We: "}
                            {t.content ?? "(no text)"}
                          </span>
                        ))}
                      </span>
                    </label>
                  );
                })}
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[12px] border p-3.5",
                    resolution?.kind === "new" ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="resolution"
                    className="mt-1 size-4 accent-[var(--accent)]"
                    checked={resolution?.kind === "new"}
                    disabled={disabled}
                    onChange={() => onChoose({ kind: "new" })}
                  />
                  <span className="text-[14px] font-medium">
                    New enquiry{" "}
                    <span className="block text-[13px] font-normal text-muted">A separate lead for something different.</span>
                  </span>
                </label>
                {dup.recommendation_reason && (
                  <p className="text-[13px] text-muted">Suggested: {dup.recommendation_reason}.</p>
                )}
                {choiceMissing && (
                  <p role="alert" className="text-[13px] text-danger">
                    Choose where this goes before confirming.
                  </p>
                )}
              </fieldset>
            )}
          </CardBody>
        </Card>
      )}

      {others.length > 0 && (
        <InlineAlert tone="warning" className="space-y-1">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4" aria-hidden />A teammate may have captured this person too
          </p>
          <ul className="space-y-0.5">
            {others.map((o) => (
              <li key={o.capture_id}>
                <Link href={`/captures/${o.capture_id}`} className="underline">
                  {o.reason}, <UserName id={o.created_by_user_id} />, {formatTime(o.created_at)}
                </Link>{" "}
                <span className="opacity-80">({CAPTURE_LABEL[o.status] ?? o.status})</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px]">Open it to compare, and discard one of the two.</p>
        </InlineAlert>
      )}

      {!dup.contact && similar.length > 0 && (
        <InlineAlert tone="accent" className="space-y-1">
          <p className="font-medium">Possibly the same person</p>
          <ul className="space-y-0.5">
            {similar.map((s) => (
              <li key={s.contact.id}>
                <Link href={`/contacts/${s.contact.id}`} className="underline">
                  {s.contact.name}
                </Link>
                {s.account_name && <> at {s.account_name}</>} <span className="opacity-80">— {s.reason}</span>
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}

      {!dup.contact && dup.account && dup.account.status !== "none" && (
        <InlineAlert tone="warning">
          {dup.account.status === "confirmed" ? (
            <>
              This company already exists: <span className="font-medium">{dup.account.name}</span>. A new contact will be
              added to it.
            </>
          ) : (
            <>
              Probably the same company as <span className="font-medium">{dup.account.name}</span> (
              {Math.round(dup.account.score)}% match). It will be flagged for review, not merged.
            </>
          )}
        </InlineAlert>
      )}
    </div>
  );
}
