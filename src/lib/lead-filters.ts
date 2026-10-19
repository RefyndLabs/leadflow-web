import type { Query } from "./api/client";
import {
  LEAD_SORTS,
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_STATUSES,
  QUALIFICATION_BANDS,
  QUALITY_TAGS,
} from "./enums";
import { dayStart, localMidnight } from "./format";

/**
 * The leads list keeps every filter in the URL so a view can be bookmarked and shared. URL keys
 * mirror the API's (`stage=`, `event_id=`, `country=` …, repeated for several values) with three
 * exceptions that must be resolved for whoever is looking:
 *
 * - `owner_id=me` → the signed-in user's id;
 * - `created=today|7d|30d|custom` (+ `created_from`/`created_to` as local days, both inclusive);
 * - `follow_up=overdue|today|7d|none|custom` (+ `follow_up_from`/`follow_up_to`).
 *
 * Date presets become [from, to) instants at local midnight in the viewer's time zone, so "today"
 * means the viewer's today wherever the link is opened.
 */
export const MULTI_KEYS = [
  "stage",
  "status",
  "source",
  "event_id",
  "owner_id",
  "product_id",
  "quality_tag",
  "qualification",
  "country",
  "region",
] as const;
export type MultiKey = (typeof MULTI_KEYS)[number];

export const SINGLE_KEYS = [
  "q",
  "has_event",
  "unassigned",
  "score_min",
  "score_max",
  "created",
  "created_from",
  "created_to",
  "follow_up",
  "follow_up_from",
  "follow_up_to",
  "division",
  "sort",
] as const;
export type SingleKey = (typeof SINGLE_KEYS)[number];

/** Every key that counts as a filter (sort and paging don't). */
export const FILTER_KEYS: readonly string[] = [
  ...MULTI_KEYS,
  ...SINGLE_KEYS.filter((k) => k !== "sort"),
];

export const CREATED_PRESETS = ["today", "7d", "30d", "custom"] as const;
export type CreatedPreset = (typeof CREATED_PRESETS)[number];
export const CREATED_LABEL: Record<CreatedPreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

export const FOLLOW_UP_PRESETS = [
  "overdue",
  "today",
  "7d",
  "none",
  "custom",
] as const;
export type FollowUpPreset = (typeof FOLLOW_UP_PRESETS)[number];
export const FOLLOW_UP_LABEL: Record<FollowUpPreset, string> = {
  overdue: "Overdue",
  today: "Due today",
  "7d": "Next 7 days",
  none: "No follow-up set",
  custom: "Custom range",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Params = Pick<URLSearchParams, "get" | "getAll">;

const one = <T extends string>(allowed: readonly T[], v: string | null) =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const many = <T extends string>(allowed: readonly T[], vs: string[]) =>
  vs.filter((v): v is T => (allowed as readonly string[]).includes(v));
const ids = (vs: string[]) => vs.filter((v) => UUID.test(v));
const score = (v: string | null) => {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : undefined;
};
/** Inclusive local day → the next day's local midnight (the API's `_to` is exclusive). */
const dayAfter = (day: string) => {
  const start = dayStart(day);
  if (!start) return undefined;
  const d = new Date(start);
  return localMidnight(1, d);
};

/** URL → `GET /leads/overview` and `/leads/facets` query. Unknown or malformed values are ignored. */
export function toApiQuery(
  p: Params,
  meId: string,
  now: Date = new Date(),
): Query {
  const owners = p
    .getAll("owner_id")
    .map((v) => (v === "me" ? meId : v));
  const q: Query = {
    stage: many(LEAD_STAGES, p.getAll("stage")),
    status: many(LEAD_STATUSES, p.getAll("status")),
    source: many(LEAD_SOURCES, p.getAll("source")),
    event_id: ids(p.getAll("event_id")),
    owner_id: ids(owners),
    product_id: ids(p.getAll("product_id")),
    quality_tag: many(QUALITY_TAGS, p.getAll("quality_tag")),
    qualification: many(QUALIFICATION_BANDS, p.getAll("qualification")),
    country: p
      .getAll("country")
      .filter((c) => /^[A-Za-z]{2}$/.test(c))
      .map((c) => c.toUpperCase()),
    region: p.getAll("region").filter((r) => /^[a-z_]{2,40}$/.test(r)),
    score_min: score(p.get("score_min")),
    score_max: score(p.get("score_max")),
    division: p.get("division")?.trim() || undefined,
    sort: one(LEAD_SORTS, p.get("sort")),
  };

  const text = p.get("q")?.trim() ?? "";
  if (text.length >= 2) q.q = text.slice(0, 200);

  const hasEvent = p.get("has_event");
  if (hasEvent === "true" || hasEvent === "false") q.has_event = hasEvent;
  if (p.get("unassigned") === "true") q.unassigned = true;

  switch (one(CREATED_PRESETS, p.get("created"))) {
    case "today":
      q.created_from = localMidnight(0, now);
      q.created_to = localMidnight(1, now);
      break;
    case "7d":
      q.created_from = localMidnight(-6, now);
      break;
    case "30d":
      q.created_from = localMidnight(-29, now);
      break;
    case "custom": {
      const from = p.get("created_from");
      const to = p.get("created_to");
      if (from && DAY.test(from)) q.created_from = dayStart(from) ?? undefined;
      if (to && DAY.test(to)) q.created_to = dayAfter(to);
      break;
    }
  }

  switch (one(FOLLOW_UP_PRESETS, p.get("follow_up"))) {
    case "overdue":
      q.follow_up_overdue = true;
      break;
    case "today":
      q.follow_up_from = localMidnight(0, now);
      q.follow_up_to = localMidnight(1, now);
      break;
    case "7d":
      q.follow_up_from = localMidnight(0, now);
      q.follow_up_to = localMidnight(7, now);
      break;
    case "none":
      q.has_follow_up = false;
      break;
    case "custom": {
      const from = p.get("follow_up_from");
      const to = p.get("follow_up_to");
      if (from && DAY.test(from))
        q.follow_up_from = dayStart(from) ?? undefined;
      if (to && DAY.test(to)) q.follow_up_to = dayAfter(to);
      break;
    }
  }

  // Drop empties so query keys (and the cache) stay stable.
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) delete q[k];
  }
  return q;
}

/** How many filters are on (for the "Filters (n)" button). Date ranges count once. */
export function activeFilterCount(p: Params): number {
  let n = 0;
  for (const k of MULTI_KEYS) n += p.getAll(k).length;
  for (const k of ["q", "has_event", "unassigned", "division", "created", "follow_up"])
    if (p.get(k)) n += 1;
  if (p.get("score_min") || p.get("score_max")) n += 1;
  return n;
}

/** Suggested saved views (hand-off §5.3). `event` adds "This show" when a show is on. */
export interface QuickView {
  key: string;
  label: string;
  params: Record<string, string>;
}

export function quickViews(currentEventId?: string | null): QuickView[] {
  const views: QuickView[] = [
    {
      key: "my-overdue",
      label: "My overdue follow-ups",
      params: { owner_id: "me", follow_up: "overdue" },
    },
    {
      key: "hot-not-contacted",
      label: "Hot, not contacted",
      params: { qualification: "hot", stage: "not_contacted" },
    },
  ];
  if (currentEventId)
    views.push({
      key: "this-show",
      label: "This show",
      params: { event_id: currentEventId },
    });
  return views;
}

export function viewHref(params: Record<string, string>): string {
  return `/leads?${new URLSearchParams(params).toString()}`;
}

/** True when the URL holds exactly this view's filters (so the chip shows as selected). */
export function isView(p: URLSearchParams, params: Record<string, string>): boolean {
  const keys = new Set<string>();
  p.forEach((_v, k) => {
    if (k !== "sort" && k !== "skip") keys.add(k);
  });
  const want = Object.keys(params);
  return (
    keys.size === want.length &&
    want.every((k) => p.getAll(k).length === 1 && p.get(k) === params[k])
  );
}
