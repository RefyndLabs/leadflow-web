"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, ChevronRight, Plus } from "lucide-react";
import { events, useCaptureQueue } from "@/lib/api/hooks";
import type { Capture } from "@/lib/api/types";
import { CAPTURE_LABEL, CAPTURE_STATUSES } from "@/lib/enums";
import { formatRelative } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { attachmentSrc } from "./attachments";
import { useAuth } from "./auth";
import { CaptureBadge } from "./capture-badge";
import { EventName, UserName } from "./entities";
import { PageHeader } from "./page-header";

function title(c: Capture): string {
  return (
    c.extracted?.contact_name ??
    c.extracted?.account_name ??
    c.note ??
    "Untitled capture"
  );
}

function Row({ c }: { c: Capture }) {
  // The front of the card; the back when only the back was photographed.
  const thumb = c.status !== "discarded" ? (c.card ?? c.card_back) : null;
  const twoSided = Boolean(c.card && c.card_back) && c.status !== "discarded";
  return (
    <li>
      <Link
        href={`/captures/${c.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5"
      >
        <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-surface-2 text-muted">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachmentSrc(thumb.id)}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <Camera className="size-5" aria-hidden />
          )}
          {twoSided && (
            <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[10px] font-medium leading-4 text-white">
              2 sides
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">
            {title(c)}
          </span>
          <span className="block truncate text-[13px] text-muted">
            {c.event?.name ??
              (c.event_id ? <EventName id={c.event_id} /> : "No show")}{" "}
            · {c.created_by?.name ?? <UserName id={c.created_by_user_id} />}{" "}
            ·{" "}
            <time dateTime={c.created_at}>{formatRelative(c.created_at)}</time>
          </span>
        </span>
        <CaptureBadge status={c.status} />
        <ChevronRight
          className="hidden size-4 shrink-0 text-muted sm:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}

export function CapturesQueue() {
  const { me, can } = useAuth();
  const url = useUrlState();
  const status = url.get("status");
  const eventId = url.get("event_id");
  const mine = url.get("mine") === "1";
  const evs = events.useList({ limit: 200 }, { enabled: can("events:read") });
  const q = useCaptureQueue({
    status: CAPTURE_STATUSES.includes(status as never) ? status : undefined,
    event_id: eventId || undefined,
    created_by_user_id: mine ? me.id : undefined,
    skip: url.skip,
    limit: PAGE_SIZE,
  });
  const filtered = Boolean(status || eventId || mine);

  return (
    <>
      <PageHeader
        title="Captures"
        description="Cards and voice notes from shows. Check what was read, fix it, and confirm to create the lead."
        actions={
          can("captures:write") && (
            <Button asChild>
              <Link href="/events/capture">
                <Plus aria-hidden />
                New capture
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Show">
          <Select
            value={eventId}
            onChange={(e) => url.set({ event_id: e.target.value })}
          >
            <option value="">All shows</option>
            {evs.data?.items.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => url.set({ status: e.target.value })}
          >
            <option value="">Any status</option>
            {CAPTURE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CAPTURE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <label
          className={cn(
            "flex h-11 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-[14px] font-medium ring-1 ring-line sm:h-9",
            mine ? "bg-foreground text-background" : "bg-surface",
          )}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={mine}
            onChange={(e) => url.set({ mine: e.target.checked ? "1" : null })}
          />
          Mine only
        </label>
      </div>

      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={Camera}
            title={filtered ? "No captures match" : "No captures yet"}
            description={
              filtered
                ? "Try clearing a filter."
                : "Capture a card and a voice note at a show and they'll appear here."
            }
            action={
              !filtered && can("captures:write") ? (
                <Button asChild>
                  <Link href="/events/capture">
                    <Plus aria-hidden />
                    Capture at a show
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {q.data.items.map((c) => (
                <Row key={c.id} c={c} />
              ))}
            </ul>
            <Pagination
              skip={url.skip}
              total={q.data.total}
              count={q.data.items.length}
              onChange={(s) => url.set({ skip: s || null }, { keepSkip: true })}
              noun="captures"
            />
          </>
        )}
      </Card>
    </>
  );
}
