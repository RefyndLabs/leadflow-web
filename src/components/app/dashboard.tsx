"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Clock, PhoneOff, Plus } from "lucide-react";
import {
  events,
  leads as leadsApi,
  products,
  useDueCadences,
  useLeadStats,
} from "@/lib/api/hooks";
import type { LeadStats, LeadStatus } from "@/lib/api/types";
import {
  QUALITY_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  humanize,
} from "@/lib/enums";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "./page-header";
import { useAuth } from "./auth";

/** Left-to-right order of the pipeline strip. Side branches (stale, lost) follow the main path. */
const STRIP: { status: LeadStatus; bar: string }[] = [
  { status: "new", bar: "bg-line-strong" },
  { status: "uncontacted", bar: "bg-muted/60" },
  { status: "in_conversation", bar: "bg-accent" },
  { status: "quotation_requested", bar: "bg-accent/60" },
  { status: "won", bar: "bg-success" },
  { status: "stale", bar: "bg-warning" },
  { status: "lost", bar: "bg-danger" },
];

function count(map: Record<string, number> | undefined, key: string): number {
  return map?.[key] ?? 0;
}

/** Attention tile: a number that answers "what needs me right now?" and links to the fix. */
function Attention({
  href,
  icon: Icon,
  label,
  value,
  loading,
  hint,
}: {
  href: string;
  icon: typeof Clock;
  label: string;
  value: number | undefined;
  loading: boolean;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[14px] border border-line bg-surface p-4 transition-colors hover:border-line-strong sm:p-5"
    >
      <div className="flex items-center justify-between text-muted">
        <span className="flex items-center gap-2 text-[13px] font-medium">
          <Icon className="size-4" aria-hidden />
          {label}
        </span>
        <ArrowRight
          className="size-4 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>
      <div className="mt-2 text-[34px] font-semibold leading-none tracking-tight tabular">
        {loading ? <Skeleton className="h-8 w-14" /> : formatCount(value ?? 0)}
      </div>
      <p className="mt-2 text-[13px] text-muted">{hint}</p>
    </Link>
  );
}

function PipelineStrip({ stats }: { stats: LeadStats }) {
  const total = stats.total_leads || 1;
  const parts = STRIP.map((s) => ({
    ...s,
    n: count(stats.by_status, s.status),
  })).filter((p) => p.n > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <span className="text-[13px] text-muted tabular">
          {formatCount(stats.total_leads)} leads
        </span>
      </CardHeader>
      <CardBody>
        {parts.length === 0 ? (
          <p className="text-[14px] text-muted">No leads yet.</p>
        ) : (
          <>
            {/* Meaning is duplicated in the legend below, so the bar's colour is never the only carrier. */}
            <div
              className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
              role="img"
              aria-label={parts
                .map((p) => `${STATUS_LABEL[p.status]} ${p.n}`)
                .join(", ")}
            >
              {parts.map((p) => (
                <div
                  key={p.status}
                  className={cn(
                    "min-w-1 first:rounded-l-full last:rounded-r-full",
                    p.bar,
                  )}
                  style={{ flexGrow: p.n / total }}
                />
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
              {STRIP.map((s) => {
                const n = count(stats.by_status, s.status);
                return (
                  <li key={s.status}>
                    <Link
                      href={`/leads?status=${s.status}`}
                      className="flex items-center gap-2 rounded-lg py-2 text-[14px] hover:bg-surface-2 sm:-mx-2 sm:px-2"
                    >
                      <span
                        className={cn("size-2.5 shrink-0 rounded-full", s.bar)}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        {STATUS_LABEL[s.status]}
                      </span>
                      <span className="tabular text-muted">
                        {formatCount(n)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function Breakdown({
  title,
  data,
  label,
  href,
}: {
  title: string;
  data: Record<string, number> | undefined;
  label: (key: string) => React.ReactNode;
  href?: (key: string) => string | null;
}) {
  const rows = Object.entries(data ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {rows.length === 0 ? (
          <p className="text-[14px] text-muted">Nothing to show yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map(([key, n]) => {
              const to = href?.(key);
              const inner = (
                <>
                  <div className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate">{label(key)}</span>
                    <span className="tabular text-muted">{formatCount(n)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  </div>
                </>
              );
              return (
                <li key={key}>
                  {to ? (
                    <Link
                      href={to}
                      className="block rounded-lg hover:opacity-80"
                    >
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function EventLabel({ id, names }: { id: string; names: Map<string, string> }) {
  return (
    <>{id === "unset" ? "No exhibition" : (names.get(id) ?? "Exhibition")}</>
  );
}

export function Dashboard() {
  const { me, can } = useAuth();
  const canStats = can("stats:read");
  const stats = useLeadStats(canStats);
  const due = useDueCadences(can("cadences:read"));
  const stale = leadsApi.useList(
    { status: "stale", limit: 1 },
    { enabled: can("leads:read") },
  );

  const eventNames = events.useList(
    { limit: 200 },
    { enabled: can("events:read") && canStats },
  );
  const productNames = products.useList(
    { limit: 200 },
    { enabled: can("catalog:read") && canStats },
  );
  const evMap = React.useMemo(
    () => new Map((eventNames.data?.items ?? []).map((e) => [e.id, e.name])),
    [eventNames.data],
  );
  const prMap = React.useMemo(
    () => new Map((productNames.data?.items ?? []).map((p) => [p.id, p.name])),
    [productNames.data],
  );

  const s = stats.data;
  return (
    <>
      <PageHeader
        title="Home"
        description={`${me.organization.name} — where the pipeline stands today.`}
        actions={
          can("leads:ingest") && (
            <Button asChild>
              <Link href="/leads/new">
                <Plus aria-hidden />
                Log enquiry
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {can("cadences:read") && (
          <Attention
            href="/follow-ups"
            icon={BellRing}
            label="Follow-ups due"
            value={due.data?.length}
            loading={due.isPending}
            hint="Leads whose next follow-up is due now"
          />
        )}
        {can("leads:read") && (
          <Attention
            href="/leads?status=stale"
            icon={Clock}
            label="Gone stale"
            value={stale.data?.total ?? stale.data?.items.length}
            loading={stale.isPending}
            hint="No reply within the follow-up window"
          />
        )}
        {canStats && (
          <Attention
            href="/leads?status=uncontacted"
            icon={PhoneOff}
            label="Not yet contacted"
            value={s ? count(s.by_status, "uncontacted") : undefined}
            loading={stats.isPending}
            hint="Waiting for a first message"
          />
        )}
      </div>

      {!canStats ? (
        <Card className="mt-6">
          <EmptyState
            title="Statistics aren't available for your role"
            description="You can still work on leads from the Leads tab."
            action={
              <Button asChild variant="secondary">
                <Link href="/leads">Open leads</Link>
              </Button>
            }
          />
        </Card>
      ) : stats.isError ? (
        <Card className="mt-6">
          <ErrorState
            error={stats.error}
            onRetry={() => void stats.refetch()}
          />
        </Card>
      ) : stats.isPending || !s ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-44 w-full rounded-[14px]" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56 rounded-[14px]" />
            <Skeleton className="h-56 rounded-[14px]" />
          </div>
        </div>
      ) : s.total_leads === 0 ? (
        <Card className="mt-6">
          <EmptyState
            title="No leads yet"
            description="Leads arrive from your channels automatically, or you can log one by hand."
            action={
              can("leads:ingest") ? (
                <Button asChild>
                  <Link href="/leads/new">
                    <Plus aria-hidden />
                    Log an enquiry
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          <PipelineStrip stats={s} />
          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown
              title="By source"
              data={s.by_source}
              label={(k) =>
                (SOURCE_LABEL as Record<string, string>)[k] ?? humanize(k)
              }
              href={(k) => (k === "unset" ? null : `/leads?source=${k}`)}
            />
            <Breakdown
              title="Quality"
              data={s.by_quality_tag}
              label={(k) =>
                (QUALITY_LABEL as Record<string, string>)[k] ?? "Not rated"
              }
              href={(k) => (k === "unset" ? null : `/leads?quality_tag=${k}`)}
            />
            <Breakdown
              title="By division"
              data={s.by_division}
              label={(k) => (k === "unset" ? "No division" : k)}
              href={(k) =>
                k === "unset"
                  ? null
                  : `/leads?division=${encodeURIComponent(k)}`
              }
            />
            <Breakdown
              title="By exhibition"
              data={s.by_event}
              label={(k) => <EventLabel id={k} names={evMap} />}
              href={(k) => (k === "unset" ? null : `/leads?event_id=${k}`)}
            />
            <Breakdown
              title="By product"
              data={s.by_product}
              label={(k) =>
                k === "unset" ? "No product" : (prMap.get(k) ?? "Product")
              }
              href={(k) => (k === "unset" ? null : `/leads?product_id=${k}`)}
            />
          </div>
        </div>
      )}
    </>
  );
}
