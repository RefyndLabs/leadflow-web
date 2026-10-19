"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  Filter,
  Inbox,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  useCurrentEvents,
  useLeadFacets,
  useLeadOverview,
} from "@/lib/api/hooks";
import type { FacetCount, LeadListItem } from "@/lib/api/types";
import {
  LEAD_SORTS,
  LEAD_SOURCES,
  LEAD_STAGES,
  QUALIFICATION_LABEL,
  QUALITY_LABEL,
  SORT_LABEL,
  STAGE_LABEL,
  STATUS_LABEL,
  regionLabel,
  sourceLabel,
  type LeadSort,
} from "@/lib/enums";
import {
  countryFlag,
  formatCount,
  formatDate,
  formatRelative,
  initials,
  isPast,
} from "@/lib/format";
import {
  CREATED_LABEL,
  CREATED_PRESETS,
  FILTER_KEYS,
  FOLLOW_UP_LABEL,
  FOLLOW_UP_PRESETS,
  activeFilterCount,
  isView,
  quickViews,
  toApiQuery,
} from "@/lib/lead-filters";
import { useDebounced } from "@/lib/use-debounced";
import { useUrlState } from "@/lib/use-url-state";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { useAuth } from "./auth";
import { QualityBadge, StatusBadge } from "./badges";
import { PageHeader } from "./page-header";
import { ProductOptions } from "./pickers";

/* ── Row ───────────────────────────────────────────────────────────────── */
function ScoreBadge({ lead }: { lead: LeadListItem }) {
  if (typeof lead.qualification_score === "number") {
    const tag = lead.qualification_tag;
    return (
      <Badge
        tone={tag === "hot" ? "danger" : tag === "warm" ? "warning" : tag === "cold" ? "accent" : "neutral"}
        title="AI qualification score"
      >
        AI {lead.qualification_score}
        {tag && <span className="sr-only"> ({QUALITY_LABEL[tag]})</span>}
      </Badge>
    );
  }
  if (lead.research_status === "requested" || lead.research_status === "processing")
    return <span className="text-[12px] text-muted">Researching…</span>;
  return <span className="text-[12px] text-muted">Not researched</span>;
}

function FollowUpCell({ lead }: { lead: LeadListItem }) {
  const at = lead.next_follow_up_at;
  if (!at) return <span className="text-muted">—</span>;
  const closed = lead.status === "won" || lead.status === "lost";
  const overdue = !closed && isPast(at);
  return (
    <time dateTime={at} className={cn(overdue && "font-medium text-danger")}>
      {overdue ? "Overdue · " : ""}
      {formatDate(at)}
    </time>
  );
}

const GRID =
  "lg:grid lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_9.5rem_7rem_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem_6rem] lg:items-center lg:gap-3";

function LeadRow({ lead, meId }: { lead: LeadListItem; meId: string }) {
  const names = lead.products ?? [];
  const product = names[0];
  const more = names.length - 1;
  const country = lead.account.country;
  return (
    <li>
      <Link
        href={`/leads/${lead.id}`}
        className={cn(
          "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5",
          GRID,
        )}
      >
        {/* Contact and company (with the mobile summary underneath) */}
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted"
            aria-hidden
          >
            {initials(lead.contact.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-medium">{lead.contact.name}</span>
            <span className="block truncate text-[13px] text-muted">
              {country && (
                <span aria-hidden className="mr-1">
                  {countryFlag(country)}
                </span>
              )}
              {lead.account.name}
              {lead.lead_title && <span className="lg:hidden"> · {lead.lead_title}</span>}
            </span>
            <span className="block truncate text-[12px] text-muted lg:hidden">
              {lead.event ? lead.event.name : sourceLabel(lead.source)}
              {product && <> · {product}{more > 0 && ` +${more}`}</>}
              {lead.next_follow_up_at && (
                <>
                  {" · "}
                  <FollowUpCell lead={lead} />
                </>
              )}
            </span>
          </span>
        </span>
        <span className="hidden min-w-0 truncate text-[13px] lg:block">
          {lead.event ? lead.event.name : <span className="text-muted">{sourceLabel(lead.source)}</span>}
        </span>
        {/* Status + scores: right-hand column on phones */}
        <span className="flex shrink-0 flex-col items-end gap-1.5 lg:items-start">
          <StatusBadge status={lead.status} />
          <span className="flex items-center gap-1.5 lg:hidden">
            <ScoreBadge lead={lead} />
            {lead.quality_tag && <QualityBadge tag={lead.quality_tag} />}
          </span>
        </span>
        <span className="hidden flex-col items-start gap-1 lg:flex">
          <ScoreBadge lead={lead} />
          {lead.quality_tag ? (
            <QualityBadge tag={lead.quality_tag} />
          ) : (
            <span className="text-[12px] text-muted">Not rated</span>
          )}
        </span>
        <span className="hidden min-w-0 truncate text-[13px] lg:block">
          {product ?? <span className="text-muted">—</span>}
          {more > 0 && <span className="text-muted"> +{more}</span>}
        </span>
        <span className="hidden min-w-0 truncate text-[13px] lg:block">
          {lead.owner ? (lead.owner.id === meId ? "You" : lead.owner.name) : <span className="text-muted">Unassigned</span>}
        </span>
        <span className="hidden text-[13px] lg:block">
          <FollowUpCell lead={lead} />
        </span>
        <span className="hidden text-[13px] text-muted lg:block">
          <time dateTime={lead.created_at}>{formatRelative(lead.created_at)}</time>
        </span>
        <ChevronRight className="hidden size-4 shrink-0 text-muted sm:block lg:hidden" aria-hidden />
      </Link>
    </li>
  );
}

function HeaderRow() {
  return (
    <div
      aria-hidden
      className={cn(
        "hidden border-b border-line px-5 py-2 text-[12px] font-medium uppercase tracking-wide text-muted",
        GRID,
      )}
    >
      <span>Contact & company</span>
      <span>Exhibition</span>
      <span>Status</span>
      <span>Score</span>
      <span>Product</span>
      <span>Owner</span>
      <span>Follow-up</span>
      <span>Created</span>
    </div>
  );
}

/* ── Filter controls ──────────────────────────────────────────────────── */
type Url = ReturnType<typeof useUrlState>;

/** Toggle chips for one facet. `nullKey` maps the "not set" bucket to its own URL flag. */
function FacetChips({
  title,
  facet,
  urlKey,
  url,
  nullFlag,
  labelOf,
  toUrl = (v) => v,
}: {
  title: string;
  facet: FacetCount[] | undefined;
  urlKey: string;
  url: Url;
  nullFlag?: { key: string; value: string };
  labelOf?: (f: FacetCount) => React.ReactNode;
  /** Facet value → URL value (e.g. the viewer's own id → "me"). */
  toUrl?: (v: string) => string;
}) {
  const selected = url.getAll(urlKey);
  if (!facet || facet.length === 0) return null;
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-[13px] font-medium">{title}</legend>
      <div className="flex flex-wrap gap-1.5">
        {facet.map((f) => {
          const isNull = f.value === null;
          if (isNull && !nullFlag) return null;
          const value = isNull ? null : toUrl(f.value!);
          const on = isNull
            ? url.get(nullFlag!.key) === nullFlag!.value
            : selected.includes(value!) || selected.includes(f.value!);
          return (
            <button
              key={f.value ?? "none"}
              type="button"
              aria-pressed={on}
              onClick={() =>
                isNull
                  ? url.set({ [nullFlag!.key]: on ? null : nullFlag!.value })
                  : url.set({
                      [urlKey]: on
                        ? selected.filter((s) => s !== value && s !== f.value)
                        : [...selected, value!],
                    })
              }
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors sm:h-8",
                on
                  ? "bg-foreground text-background"
                  : "bg-surface text-foreground ring-1 ring-line hover:bg-surface-2",
              )}
            >
              {labelOf ? labelOf(f) : f.label}
              <span className={cn("tabular", on ? "opacity-80" : "text-muted")}>{formatCount(f.count)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Text that commits to the URL on blur or Enter (not on every keystroke). */
function CommitInput({
  value,
  onCommit,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = React.useState(value);
  // The URL changed elsewhere (Clear all, a saved view): show its value.
  const [seen, setSeen] = React.useState(value);
  if (seen !== value) {
    setSeen(value);
    setV(value);
  }
  return (
    <Input
      {...props}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(v);
        }
      }}
    />
  );
}

function DateRange({
  url,
  presetKey,
  fromKey,
  toKey,
  label,
  presets,
  labels,
}: {
  url: Url;
  presetKey: string;
  fromKey: string;
  toKey: string;
  label: string;
  presets: readonly string[];
  labels: Record<string, string>;
}) {
  const preset = url.get(presetKey);
  return (
    <div className="space-y-2">
      <Field label={label}>
        <Select
          value={preset}
          onChange={(e) =>
            url.set({
              [presetKey]: e.target.value,
              ...(e.target.value !== "custom" ? { [fromKey]: null, [toKey]: null } : {}),
            })
          }
        >
          <option value="">Any time</option>
          {presets.map((p) => (
            <option key={p} value={p}>
              {labels[p]}
            </option>
          ))}
        </Select>
      </Field>
      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="From">
            <Input type="date" value={url.get(fromKey)} onChange={(e) => url.set({ [fromKey]: e.target.value })} />
          </Field>
          <Field label="To">
            <Input type="date" value={url.get(toKey)} onChange={(e) => url.set({ [toKey]: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}

function FilterPanel({ url, facets, meId }: { url: Url; facets: ReturnType<typeof useLeadFacets>["data"]; meId: string }) {
  const { can } = useAuth();
  return (
    <div className="space-y-5">
      <FacetChips
        title="Exhibition"
        facet={facets?.event}
        urlKey="event_id"
        url={url}
        nullFlag={{ key: "has_event", value: "false" }}
        labelOf={(f) => (f.value === null ? "Not from an exhibition" : f.label)}
      />
      <FacetChips
        title="AI qualification score"
        facet={facets?.qualification}
        urlKey="qualification"
        url={url}
        labelOf={(f) => QUALIFICATION_LABEL[f.value as keyof typeof QUALIFICATION_LABEL] ?? f.label}
      />
      <div className="grid max-w-xs grid-cols-2 gap-2">
        <Field label="Score from">
          <CommitInput
            inputMode="numeric"
            placeholder="0"
            value={url.get("score_min")}
            onCommit={(v) => url.set({ score_min: v.replace(/\D/g, "") })}
          />
        </Field>
        <Field label="Score to">
          <CommitInput
            inputMode="numeric"
            placeholder="100"
            value={url.get("score_max")}
            onCommit={(v) => url.set({ score_max: v.replace(/\D/g, "") })}
          />
        </Field>
      </div>
      <FacetChips
        title="Your rating"
        facet={facets?.quality_tag}
        urlKey="quality_tag"
        url={url}
        labelOf={(f) => QUALITY_LABEL[f.value as keyof typeof QUALITY_LABEL] ?? f.label}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateRange
          url={url}
          label="Date created"
          presetKey="created"
          fromKey="created_from"
          toKey="created_to"
          presets={CREATED_PRESETS}
          labels={CREATED_LABEL}
        />
        <DateRange
          url={url}
          label="Next follow-up"
          presetKey="follow_up"
          fromKey="follow_up_from"
          toKey="follow_up_to"
          presets={FOLLOW_UP_PRESETS}
          labels={FOLLOW_UP_LABEL}
        />
      </div>
      <FacetChips
        title="Region"
        facet={facets?.region?.filter((f) => f.value !== null)}
        urlKey="region"
        url={url}
        labelOf={(f) => (f.value ? regionLabel(f.value) : f.label)}
      />
      <FacetChips
        title="Country"
        facet={facets?.country?.filter((f) => f.value !== null)}
        urlKey="country"
        url={url}
        labelOf={(f) => (
          <>
            <span aria-hidden>{countryFlag(f.value)}</span> {f.label}
          </>
        )}
      />
      <FacetChips
        title="Owner"
        facet={facets?.owner}
        urlKey="owner_id"
        url={url}
        nullFlag={{ key: "unassigned", value: "true" }}
        toUrl={(v) => (v === meId ? "me" : v)}
        labelOf={(f) => (f.value === null ? "Unassigned" : f.value === meId ? "You" : f.label)}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Source">
          <Select value={url.get("source")} onChange={(e) => url.set({ source: e.target.value ? [e.target.value] : [] })}>
            <option value="">Any source</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
        {can("catalog:read") && (
          <Field label="Product">
            <Select
              value={url.get("product_id")}
              onChange={(e) => url.set({ product_id: e.target.value ? [e.target.value] : [] })}
            >
              <option value="">Any product</option>
              <ProductOptions />
            </Select>
          </Field>
        )}
        <Field label="Division">
          <CommitInput
            maxLength={200}
            placeholder="Any division"
            value={url.get("division")}
            onCommit={(v) => url.set({ division: v.trim() })}
          />
        </Field>
      </div>
    </div>
  );
}

/** Removable chips for everything that's on, so the current view reads at a glance. */
function ActiveChips({
  url,
  facets,
  meId,
}: {
  url: Url;
  facets: ReturnType<typeof useLeadFacets>["data"];
  meId: string;
}) {
  const label = (facet: FacetCount[] | undefined, v: string) => facet?.find((f) => f.value === v)?.label ?? v;
  const chips: { key: string; text: string; remove: () => void }[] = [];
  const multi = (key: string, text: (v: string) => string) =>
    url.getAll(key).forEach((v) =>
      chips.push({
        key: `${key}=${v}`,
        text: text(v),
        remove: () => url.set({ [key]: url.getAll(key).filter((x) => x !== v) }),
      }),
    );
  const single = (key: string, text: string, also: string[] = []) => {
    if (url.get(key))
      chips.push({
        key,
        text,
        remove: () => url.set(Object.fromEntries([key, ...also].map((k) => [k, null]))),
      });
  };
  multi("status", (v) => `Status: ${STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v}`);
  multi("event_id", (v) => label(facets?.event, v));
  single("has_event", url.get("has_event") === "false" ? "Not from an exhibition" : "From an exhibition");
  multi("qualification", (v) => `AI: ${QUALIFICATION_LABEL[v as keyof typeof QUALIFICATION_LABEL] ?? v}`);
  if (url.get("score_min") || url.get("score_max"))
    chips.push({
      key: "score",
      text: `AI score ${url.get("score_min") || "0"}–${url.get("score_max") || "100"}`,
      remove: () => url.set({ score_min: null, score_max: null }),
    });
  multi("quality_tag", (v) => `Rated ${QUALITY_LABEL[v as keyof typeof QUALITY_LABEL] ?? v}`);
  single("created", `Created: ${CREATED_LABEL[url.get("created") as keyof typeof CREATED_LABEL] ?? url.get("created")}`, [
    "created_from",
    "created_to",
  ]);
  single(
    "follow_up",
    `Follow-up: ${FOLLOW_UP_LABEL[url.get("follow_up") as keyof typeof FOLLOW_UP_LABEL] ?? url.get("follow_up")}`,
    ["follow_up_from", "follow_up_to"],
  );
  multi("region", (v) => regionLabel(v));
  multi("country", (v) => `${countryFlag(v)} ${label(facets?.country, v.toUpperCase())}`);
  multi("owner_id", (v) => (v === "me" || v === meId ? "Owner: you" : `Owner: ${label(facets?.owner, v)}`));
  single("unassigned", "Unassigned");
  multi("source", (v) => `Source: ${sourceLabel(v)}`);
  multi("product_id", () => "Product");
  single("division", `Division: ${url.get("division")}`);
  single("q", `“${url.get("q")}”`);
  if (chips.length === 0) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Active filters">
      {chips.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            onClick={c.remove}
            aria-label={`Remove filter: ${c.text}`}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-soft pl-3 pr-2 text-[13px] font-medium text-accent hover:bg-accent/15"
          >
            {c.text}
            <X className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function useIsPhone() {
  const [phone, setPhone] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

/* ── Screen ───────────────────────────────────────────────────────────── */
export function LeadsList() {
  const { me, can } = useAuth();
  const url = useUrlState();
  const phone = useIsPhone();
  const filterCount = activeFilterCount(url.params);
  const [open, setOpen] = React.useState(false);

  // Search box: typing updates the URL after a pause.
  const [search, setSearch] = React.useState(url.get("q"));
  const dSearch = useDebounced(search.trim(), 400);
  const urlQ = url.get("q");
  React.useEffect(() => {
    if (dSearch !== urlQ && (dSearch.length >= 2 || dSearch === "")) url.set({ q: dSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced value
  }, [dSearch]);
  const [seenQ, setSeenQ] = React.useState(urlQ);
  if (seenQ !== urlQ) {
    setSeenQ(urlQ);
    if (search.trim() !== urlQ) setSearch(urlQ);
  }

  const filters = React.useMemo(() => toApiQuery(url.params, me.id), [url.params, me.id]);
  const q = useLeadOverview({ ...filters, skip: url.skip, limit: PAGE_SIZE });
  const { sort: _sort, ...facetQuery } = filters;
  void _sort;
  const facets = useLeadFacets(facetQuery);
  const current = useCurrentEvents(can("events:read"));
  const views = quickViews(
    current.data?.suggested_event_id ?? current.data?.events.find((e) => e.timing === "ongoing")?.id,
  );

  const stages = url.getAll("stage");
  const statuses = url.getAll("status");
  const stageCount = (s: string) => facets.data?.stage.find((f) => f.value === s)?.count;
  const tabs = [{ value: "", label: "All", count: facets.data?.total }].concat(
    LEAD_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s], count: stageCount(s) })),
  );
  const clearAll = () => url.replaceAll(url.get("sort") ? { sort: url.get("sort") } : {});
  const anything = FILTER_KEYS.some((k) => url.getAll(k).length > 0);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Every enquiry across your channels, deduplicated and in one pipeline."
        actions={
          <>
            {can("leads:ingest") && (
              <Button asChild variant="secondary">
                <Link href="/leads/import">
                  <Upload aria-hidden />
                  Import
                </Link>
              </Button>
            )}
            {can("leads:ingest") && (
              <Button asChild>
                <Link href="/leads/new">
                  <Plus aria-hidden />
                  Log enquiry
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            aria-label="Search leads"
            placeholder="Search name, email, phone, company or title"
            className="pl-9"
            maxLength={200}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sm:w-52">
          <Select
            aria-label="Sort"
            value={url.get("sort") || "created_desc"}
            onChange={(e) => url.set({ sort: e.target.value === "created_desc" ? null : e.target.value })}
          >
            {LEAD_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s as LeadSort]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="-mx-4 mb-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div role="group" aria-label="Saved views" className="inline-flex gap-1.5">
          {views.map((v) => {
            const on = isView(url.params, v.params);
            return (
              <button
                key={v.key}
                type="button"
                aria-pressed={on}
                onClick={() => (on ? clearAll() : url.replaceAll(v.params))}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors sm:h-8",
                  on ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent hover:bg-accent/15",
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div role="tablist" aria-label="Filter by status" className="inline-flex gap-1.5">
          {tabs.map((t) => {
            const active = t.value === "" ? stages.length === 0 && statuses.length === 0 : stages.length === 1 && stages[0] === t.value;
            return (
              <button
                key={t.value || "all"}
                role="tab"
                aria-selected={active}
                onClick={() => url.set({ stage: t.value ? [t.value] : [], status: [] })}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-colors sm:h-8 sm:px-3.5",
                  active ? "bg-foreground text-background" : "bg-surface text-muted ring-1 ring-line hover:text-foreground",
                )}
              >
                {t.label}
                {typeof t.count === "number" && (
                  <span className={cn("text-[12px] tabular", active ? "opacity-80" : "")}>{formatCount(t.count)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={phone ? undefined : "lead-filters"}
        >
          <Filter aria-hidden />
          Filters
          {filterCount > 0 && (
            <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] text-accent-fg">
              {filterCount}
            </span>
          )}
        </Button>
        {anything && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X aria-hidden />
            Clear all
          </Button>
        )}
      </div>

      <ActiveChips url={url} facets={facets.data} meId={me.id} />

      {open && !phone && (
        <Card id="lead-filters" className="mb-4 p-4 sm:p-5">
          <FilterPanel url={url} facets={facets.data} meId={me.id} />
        </Card>
      )}
      {open && phone && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent
            title={`Filters${filterCount ? ` (${filterCount})` : ""}`}
            description={typeof q.data?.total === "number" ? `${formatCount(q.data.total)} leads match` : undefined}
          >
            <FilterPanel url={url} facets={facets.data} meId={me.id} />
            <div className="mt-5 flex gap-2">
              {anything && (
                <Button variant="secondary" className="flex-1" onClick={clearAll}>
                  Clear all
                </Button>
              )}
              <Button className="flex-1" onClick={() => setOpen(false)}>
                Show leads
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          anything ? (
            <EmptyState
              icon={Inbox}
              title="No leads match these filters"
              description="Try removing a filter to widen the view."
              action={
                <Button variant="secondary" onClick={clearAll}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="No leads yet"
              description="Enquiries from your channels land here automatically. You can also log one by hand."
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
          )
        ) : (
          <>
            <HeaderRow />
            <ul className={cn("divide-y divide-line", q.isPlaceholderData && "opacity-60 transition-opacity")}>
              {q.data.items.map((l) => (
                <LeadRow key={l.id} lead={l} meId={me.id} />
              ))}
            </ul>
            <Pagination
              skip={url.skip}
              total={q.data.total}
              count={q.data.items.length}
              onChange={(s) => url.set({ skip: s || null }, { keepSkip: true })}
              noun="leads"
            />
          </>
        )}
      </Card>
    </>
  );
}
