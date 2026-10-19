"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Inbox, Pencil, ScanLine, Users } from "lucide-react";
import { events, useEventSummary, useSetEventMembers } from "@/lib/api/hooks";
import { describeError } from "@/lib/api/errors";
import type { EventRecord, LeadQualityTag, LeadStatus } from "@/lib/api/types";
import {
  CAPTURE_LABEL,
  QUALITY_LABEL,
  STATUS_LABEL,
  humanize,
} from "@/lib/enums";
import { formatCount, formatDateRange } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, ErrorState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { useAuth } from "./auth";
import { EventDialog, TeamPicker, TimingBadge, placeOf } from "./events";
import { PageHeader } from "./page-header";

function Bars({
  title,
  data,
  labelOf,
}: {
  title: string;
  data: Record<string, number>;
  labelOf: (k: string) => string;
}) {
  const entries = Object.entries(data).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody className="pt-3">
        {entries.length === 0 ? (
          <p className="text-[14px] text-muted">Nothing yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {entries.map(([k, n]) => (
              <li key={k} className="text-[14px]">
                <div className="flex justify-between gap-2">
                  <span>{labelOf(k)}</span>
                  <span className="font-medium tabular">{formatCount(n)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tabular">{formatCount(value)}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-[14px] border border-line bg-surface p-4 hover:bg-surface-2">
      {body}
    </Link>
  ) : (
    <div className="rounded-[14px] border border-line bg-surface p-4">{body}</div>
  );
}

function EditTeam({ event, onClose }: { event: EventRecord; onClose: () => void }) {
  const save = useSetEventMembers(event.id, { handled: true, success: "Team updated" });
  const members = event.members ?? [];
  const [team, setTeam] = React.useState(members.map((m) => m.user_id));
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Team at the show" description="This replaces the whole team.">
        <div className="space-y-4">
          {error && <InlineAlert>{error}</InlineAlert>}
          <TeamPicker value={team} onChange={setTeam} />
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              onClick={async () => {
                setError(null);
                const roles = new Map(members.map((m) => [m.user_id, m.role]));
                try {
                  await save.mutateAsync(team.map((user_id) => ({ user_id, role: roles.get(user_id) ?? null })));
                  onClose();
                } catch (e) {
                  setError(describeError(e));
                }
              }}
            >
              Save team
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EventDetail({ id }: { id: string }) {
  const { me, can } = useAuth();
  const q = events.useOne(id);
  const summary = useEventSummary(id, can("stats:read"));
  const [editing, setEditing] = React.useState(false);
  const [editingTeam, setEditingTeam] = React.useState(false);

  if (q.isPending) return <Skeleton className="h-64 w-full rounded-[14px]" />;
  if (q.isError)
    return (
      <>
        <PageHeader title="Exhibition" back={{ href: "/events", label: "Exhibitions" }} />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </>
    );
  const e = q.data;
  const team = e.members ?? [];
  const canWrite = can("events:write");
  const s = summary.data;

  return (
    <>
      <PageHeader
        back={{ href: "/events", label: "Exhibitions" }}
        title={e.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <TimingBadge timing={e.timing} plain />
            {formatDateRange(e.date, e.end_date)}
            {placeOf(e) && <> · {placeOf(e)}</>}
            {e.booth && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1">
                  <Building2 className="size-3.5" aria-hidden />
                  Stand {e.booth}
                </span>
              </>
            )}
          </span>
        }
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/leads?event_id=${e.id}`}>
                <Inbox aria-hidden />
                View leads
              </Link>
            </Button>
            {can("captures:write") && e.timing !== "past" && (
              <Button asChild variant="secondary">
                <Link href={`/events/capture?event=${e.id}`}>
                  <ScanLine aria-hidden />
                  Capture
                </Link>
              </Button>
            )}
            {canWrite && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit
              </Button>
            )}
          </>
        }
      />
      {e.notes && <p className="mb-4 whitespace-pre-wrap rounded-[12px] bg-surface-2 px-4 py-3 text-[14px]">{e.notes}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {!can("stats:read") ? null : summary.isPending ? (
            <Skeleton className="h-40 w-full rounded-[14px]" />
          ) : summary.isError ? (
            <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
          ) : s ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Leads" value={s.total_leads} href={`/leads?event_id=${e.id}`} />
                <Stat
                  label="Captures to review"
                  value={s.captures_to_review}
                  href={`/captures?event_id=${e.id}&status=ready_for_review`}
                />
                <Stat
                  label="Captures"
                  value={Object.values(s.captures_by_status).reduce((a, b) => a + b, 0)}
                  href={`/captures?event_id=${e.id}`}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Bars
                  title="Leads by status"
                  data={s.leads_by_status}
                  labelOf={(k) => STATUS_LABEL[k as LeadStatus] ?? humanize(k)}
                />
                <Bars
                  title="Leads by rating"
                  data={s.leads_by_quality}
                  labelOf={(k) => QUALITY_LABEL[k as LeadQualityTag] ?? (k === "unset" ? "Not rated" : humanize(k))}
                />
                <Bars
                  title="Captures"
                  data={s.captures_by_status}
                  labelOf={(k) => CAPTURE_LABEL[k as keyof typeof CAPTURE_LABEL] ?? humanize(k)}
                />
              </div>
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle>By team member</CardTitle>
                </CardHeader>
                {s.by_member.length === 0 ? (
                  <EmptyState className="py-6" title="Nothing captured yet" />
                ) : (
                  <table className="mt-2 w-full text-[14px]">
                    <thead>
                      <tr className="border-b border-line text-left text-[12px] uppercase tracking-wide text-muted">
                        <th scope="col" className="px-4 py-2 font-medium sm:px-5">Name</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Captures</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium sm:pr-5">Leads</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {s.by_member.map((m) => (
                        <tr key={m.user_id}>
                          <td className="px-4 py-2.5 sm:px-5">{m.user_id === me.id ? "You" : m.name}</td>
                          <td className="px-4 py-2.5 text-right tabular">{formatCount(m.captures)}</td>
                          <td className="px-4 py-2.5 text-right tabular sm:pr-5">{formatCount(m.leads)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden />
              Team at the show
            </CardTitle>
            {canWrite && can("users:read") && (
              <Button variant="ghost" size="sm" onClick={() => setEditingTeam(true)}>
                <Pencil aria-hidden />
                Edit team
              </Button>
            )}
          </CardHeader>
          <CardBody className="pt-2">
            {team.length === 0 ? (
              <p className="text-[14px] text-muted">No one is on the team yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {team.map((m) => (
                  <li key={m.user_id} className="py-2.5 text-[14px]">
                    <span className="font-medium">{m.user_id === me.id ? `${m.name} (you)` : m.name}</span>
                    {!m.is_active && <span className="ml-1 text-[12px] text-muted">· inactive</span>}
                    <span className="block text-[13px] text-muted">{[m.role, m.email].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {editing && <EventDialog event={e} open onOpenChange={() => setEditing(false)} />}
      {editingTeam && <EditTeam event={e} onClose={() => setEditingTeam(false)} />}
    </>
  );
}
