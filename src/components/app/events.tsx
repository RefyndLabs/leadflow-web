"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronRight,
  Inbox,
  Pencil,
  Plus,
  ScanLine,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  events,
  localToday,
  useSetEventMembers,
  users,
} from "@/lib/api/hooks";
import { ApiError, describeError } from "@/lib/api/errors";
import type { EventRecord } from "@/lib/api/types";
import { countryName, countryOptions } from "@/lib/countries";
import { EVENT_TIMINGS, EVENT_TIMING_LABEL, type EventTiming } from "@/lib/enums";
import { countryFlag, formatDateRange } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { eventCreate, eventUpdate } from "@/lib/schemas";
import { useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { useAuth } from "./auth";
import { PageHeader } from "./page-header";
import { FormSelect } from "./pickers";

export const TIMING_TONE: Record<string, Tone> = {
  ongoing: "success",
  upcoming: "accent",
  past: "neutral",
};

/**
 * When the show runs. On the grey page background (headers) use `plain`: tinted badges are
 * contrast-checked on white surfaces only (see globals.css).
 */
export function TimingBadge({
  timing,
  plain,
}: {
  timing: string | null | undefined;
  plain?: boolean;
}) {
  if (!timing) return null;
  if (plain)
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium",
          timing === "ongoing" ? "text-success" : timing === "upcoming" ? "text-accent" : "text-muted",
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {EVENT_TIMING_LABEL[timing as EventTiming] ?? timing}
      </span>
    );
  return (
    <Badge tone={TIMING_TONE[timing] ?? "neutral"} dot={timing === "ongoing"}>
      {EVENT_TIMING_LABEL[timing as EventTiming] ?? timing}
    </Badge>
  );
}

/** Who works the show: a checklist of active teammates (needs users:read). */
export function TeamPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const q = users.useList({ limit: 200 });
  const active = q.data?.items.filter((u) => u.is_active) ?? [];
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-[13px] font-medium">Team at the show</legend>
      {q.isPending ? (
        <p className="text-[13px] text-muted">Loading the team…</p>
      ) : active.length === 0 ? (
        <p className="text-[13px] text-muted">No active teammates.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-[12px] border border-line p-2">
          {active.map((u) => (
            <li key={u.id}>
              <label className="flex min-h-10 items-center gap-2.5 rounded-[8px] px-2 text-[14px] hover:bg-surface-2">
                <Checkbox
                  checked={value.includes(u.id)}
                  onChange={(e) =>
                    onChange(e.target.checked ? [...value, u.id] : value.filter((id) => id !== u.id))
                  }
                />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className="text-[12px] text-muted">{u.email}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">
        Their captures are pre-tagged to this show while it runs, and it&apos;s listed first for them.
      </p>
    </fieldset>
  );
}

export function EventDialog({
  event,
  open,
  onOpenChange,
}: {
  event?: EventRecord;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { can } = useAuth();
  const editing = Boolean(event);
  const create = events.useCreate({ handled: true, success: "Exhibition added" });
  const update = events.useUpdate({ handled: true, success: "Exhibition updated" });
  const setMembers = useSetEventMembers(event?.id ?? "", { handled: true });
  const { banner, setBanner, clear } = useFormBanner();
  const countries = React.useMemo(() => countryOptions(), []);
  const canTeam = can("users:read");
  const initialTeam = React.useMemo(() => (event?.members ?? []).map((m) => m.user_id), [event]);
  const [team, setTeam] = React.useState<string[]>(initialTeam);
  const form = useZodForm(editing ? eventUpdate : eventCreate, {
    name: event?.name ?? "",
    date: event?.date ?? "",
    end_date: event?.end_date ?? "",
    location: event?.location ?? "",
    country: event?.country ?? "",
    booth: event?.booth ?? "",
    notes: event?.notes ?? "",
  } as never);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      if (editing) {
        await update.mutateAsync({ id: event!.id, body: values as Record<string, unknown> });
        const changed =
          team.length !== initialTeam.length || team.some((id) => !initialTeam.includes(id));
        if (canTeam && changed) {
          // Keep each existing member's role; PUT replaces the whole list.
          const roles = new Map((event!.members ?? []).map((m) => [m.user_id, m.role]));
          await setMembers.mutateAsync(team.map((user_id) => ({ user_id, role: roles.get(user_id) ?? null })));
        }
      } else {
        await create.mutateAsync({
          ...(values as Record<string, unknown>),
          ...(canTeam && team.length ? { member_user_ids: team } : {}),
        });
      }
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit exhibition" : "New exhibition"} className="sm:max-w-xl">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <Field label="Name" required error={errors.name?.message as string | undefined}>
            <Input maxLength={300} autoFocus {...form.register("name")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First day" required error={errors.date?.message as string | undefined}>
              <Input type="date" {...form.register("date")} />
            </Field>
            <Field
              label="Last day"
              hint="Leave empty for a one-day event."
              error={errors.end_date?.message as string | undefined}
            >
              <Input type="date" {...form.register("end_date")} />
            </Field>
            <Field label="City or venue" error={errors.location?.message as string | undefined}>
              <Input maxLength={300} placeholder="e.g. Dubai World Trade Centre" {...form.register("location")} />
            </Field>
            <FormSelect control={form.control as never} name="country" label="Country" placeholder="Not set">
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </FormSelect>
            <Field
              label="Our stand"
              hint="Shown at the top of the capture screen."
              error={errors.booth?.message as string | undefined}
            >
              <Input maxLength={100} placeholder="e.g. Hall 4, B-21" {...form.register("booth")} />
            </Field>
          </div>
          <Field label="Notes" error={errors.notes?.message as string | undefined}>
            <Textarea rows={3} maxLength={4000} {...form.register("notes")} />
          </Field>
          {canTeam && <TeamPicker value={team} onChange={setTeam} />}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? "Save changes" : "Add exhibition"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function placeOf(e: { location?: string | null; country?: string | null }) {
  return [e.location, e.country ? `${countryFlag(e.country)} ${countryName(e.country)}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function EventsList() {
  const { me, can } = useAuth();
  const confirm = useConfirm();
  const url = useUrlState();
  const timing = EVENT_TIMINGS.includes(url.get("timing") as EventTiming) ? url.get("timing") : "";
  const mine = url.get("mine") === "true";
  const q = events.useList({
    timing: timing || undefined,
    mine: mine || undefined,
    on: localToday(),
    skip: url.skip,
    limit: PAGE_SIZE,
  });
  const remove = events.useRemove({ handled: true });
  const [dialog, setDialog] = React.useState<{ event?: EventRecord } | null>(null);
  const canWrite = can("events:write");

  const onDelete = async (e: EventRecord) => {
    if (
      !(await confirm({
        title: `Delete ${e.name}?`,
        description: "Leads tagged to it stay, but lose the tag. A show with captures can't be deleted.",
        confirmLabel: "Delete exhibition",
        destructive: true,
      }))
    )
      return;
    try {
      await remove.mutateAsync(e.id);
      toast.success("Exhibition deleted");
    } catch (err) {
      toast.error(err instanceof ApiError && err.status === 409 ? err.detail : describeError(err), { duration: 8000 });
    }
  };

  const tabs = [{ value: "", label: "All" }, ...EVENT_TIMINGS.map((t) => ({ value: t, label: EVENT_TIMING_LABEL[t] }))];

  return (
    <>
      <PageHeader
        title="Exhibitions"
        description="Trade shows and events. Tag leads to them to see which ones pay off."
        actions={
          <>
            {can("captures:write") && (
              <Button asChild variant="secondary">
                <Link href="/events/capture">
                  <ScanLine aria-hidden />
                  Capture at a show
                </Link>
              </Button>
            )}
            {canWrite && (
              <Button onClick={() => setDialog({})}>
                <Plus aria-hidden />
                New exhibition
              </Button>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="When" className="inline-flex gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.value || "all"}
              role="tab"
              aria-selected={timing === t.value}
              onClick={() => url.set({ timing: t.value })}
              className={cn(
                "h-10 shrink-0 rounded-full px-4 text-[14px] font-medium transition-colors sm:h-8 sm:px-3.5",
                timing === t.value
                  ? "bg-foreground text-background"
                  : "bg-surface text-muted ring-1 ring-line hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label
          className={cn(
            "flex h-10 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[14px] font-medium ring-1 ring-line sm:h-8",
            mine ? "bg-foreground text-background" : "bg-surface",
          )}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={mine}
            onChange={(e) => url.set({ mine: e.target.checked ? "true" : null })}
          />
          <Users className="size-4" aria-hidden />
          My shows
        </label>
      </div>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={4} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={timing || mine ? "No exhibitions here" : "No exhibitions yet"}
            description={
              timing || mine
                ? "Try another tab."
                : "Add a show before you go, then capture leads against it."
            }
            action={
              canWrite && !timing && !mine ? (
                <Button onClick={() => setDialog({})}>
                  <Plus aria-hidden />
                  Add an exhibition
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {q.data.items.map((e) => {
                const team = e.members ?? [];
                const onTeam = team.some((m) => m.user_id === me.id);
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                    <Link href={`/events/${e.id}`} className="group min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                        <span className="truncate group-hover:underline">{e.name}</span>
                        <TimingBadge timing={e.timing} />
                        {onTeam && <Badge tone="accent">You&apos;re on the team</Badge>}
                      </p>
                      <p className="text-[13px] text-muted">
                        {formatDateRange(e.date, e.end_date)}
                        {placeOf(e) && <> · {placeOf(e)}</>}
                        {e.booth && (
                          <>
                            {" · "}
                            <Building2 className="inline size-3.5 align-[-2px]" aria-hidden /> Stand {e.booth}
                          </>
                        )}
                        {team.length > 0 && <> · {team.length} on the team</>}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/leads?event_id=${e.id}`}>
                          <Inbox aria-hidden />
                          Leads
                        </Link>
                      </Button>
                      {can("captures:write") && e.timing !== "past" && (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/events/capture?event=${e.id}`}>
                            <ScanLine aria-hidden />
                            Capture
                          </Link>
                        </Button>
                      )}
                      {canWrite && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${e.name}`}
                            onClick={() => setDialog({ event: e })}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${e.name}`}
                            onClick={() => void onDelete(e)}
                          >
                            <Trash2 className="text-danger" />
                          </Button>
                        </>
                      )}
                      <ChevronRight className="hidden size-4 text-muted sm:block" aria-hidden />
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination
              skip={url.skip}
              total={q.data.total}
              count={q.data.items.length}
              onChange={(s) => url.set({ skip: s || null }, { keepSkip: true })}
              noun="exhibitions"
            />
          </>
        )}
      </Card>
      {dialog && <EventDialog event={dialog.event} open onOpenChange={() => setDialog(null)} />}
    </>
  );
}
