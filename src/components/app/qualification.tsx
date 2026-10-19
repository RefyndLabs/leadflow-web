"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  History,
  Lightbulb,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  useRequestResearch,
  useResearchHistory,
  useScoreLead,
} from "@/lib/api/hooks";
import type { Lead, LeadQualityTag, Research, ResearchResult } from "@/lib/api/types";
import { QUALITY_LABEL } from "@/lib/enums";
import { formatDateTime, formatRelative, safeHttpUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, InlineAlert } from "@/components/ui/feedback";
import { QualityBadge } from "./badges";

const TAG_TONE: Record<LeadQualityTag, Tone> = { hot: "danger", warm: "warning", cold: "accent" };

/** Score → band, the same rule the API uses when n8n leaves the tag out (hot ≥ 70, warm 40–69). */
export function bandOf(score: number | null | undefined): LeadQualityTag | null {
  if (score === null || score === undefined) return null;
  return score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
}

const BREAKDOWN: { key: keyof NonNullable<ResearchResult["breakdown"]>; label: string }[] = [
  { key: "value_potential", label: "Value potential" },
  { key: "purchase_intent", label: "Purchase intent" },
  { key: "product_fit", label: "Product fit" },
  { key: "engagement", label: "Engagement" },
  { key: "information_completeness", label: "Information" },
];

function Bar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-[10px] bg-surface-2 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular">
          {v}
          <span className="sr-only"> out of 100</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className={cn("h-full rounded-full", v >= 70 ? "bg-success" : v >= 40 ? "bg-warning" : "bg-danger")}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

function List({
  title,
  items,
  icon: Icon,
  tone = "muted",
}: {
  title: string;
  items: string[] | undefined;
  icon?: typeof CheckCircle2;
  tone?: "muted" | "success" | "danger" | "accent";
}) {
  if (!items?.length) return null;
  const color = { muted: "text-muted", success: "text-success", danger: "text-danger", accent: "text-accent" }[tone];
  return (
    <section className="space-y-1.5">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-[14px]">
            {Icon ? (
              <Icon className={cn("mt-0.5 size-4 shrink-0", color)} aria-hidden />
            ) : (
              <span aria-hidden className={cn("mt-2 size-1.5 shrink-0 rounded-full bg-current", color)} />
            )}
            <span className="min-w-0">{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Completed({ run, lead, canWrite }: { run: Research; lead: Lead; canWrite: boolean }) {
  const r = run.result!;
  const score = useScoreLead(lead.id);
  const tag = r.quality_tag ?? run.quality_tag ?? bandOf(r.score);
  const confidence = r.confidence ?? run.confidence;
  const bars = BREAKDOWN.filter((b) => typeof r.breakdown?.[b.key] === "number");
  const company = r.company;
  const companyFacts = company
    ? ([
        ["Industry", company.industry],
        ["Size", company.size],
        ["Founded", company.founded],
        ["Country", company.country],
        ["Location", company.location],
      ].filter(([, v]) => v) as [string, string][])
    : [];
  const site = safeHttpUrl(company?.website);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[40px] font-semibold leading-none tabular">
          {r.score}
          <span className="text-[18px] font-normal text-muted"> / 100</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {tag && (
            <Badge tone={TAG_TONE[tag]} dot>
              {QUALITY_LABEL[tag]}
            </Badge>
          )}
          {typeof confidence === "number" && (
            <span className="text-[13px] text-muted">{Math.round(confidence * 100)}% confidence</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-surface-2 px-3 py-2 text-[13px]">
        <span>
          AI score {r.score}
          {tag ? ` (${QUALITY_LABEL[tag].toLowerCase()})` : ""} · Your rating:{" "}
        </span>
        <QualityBadge tag={lead.quality_tag} />
        {canWrite && tag && lead.quality_tag !== tag && (
          <Button size="sm" variant="tint" loading={score.isPending} onClick={() => score.mutate(tag)}>
            Use AI rating
          </Button>
        )}
      </div>

      {(r.headline || r.summary) && (
        <div>
          {r.headline && <p className="text-[16px] font-semibold">{r.headline}</p>}
          {r.summary && <p className="mt-1 text-[14px] text-muted">{r.summary}</p>}
        </div>
      )}

      {bars.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {bars.map((b) => (
            <Bar key={b.key} label={b.label} value={r.breakdown![b.key] as number} />
          ))}
        </div>
      )}

      <List title="Why this score" items={r.score_reasons} />
      <div className="grid gap-5 md:grid-cols-2">
        <List title="Confirmed facts" items={r.confirmed_facts} icon={CheckCircle2} tone="success" />
        <List title="Possible inferences" items={r.possible_inferences} icon={Lightbulb} tone="accent" />
      </div>
      <List title="Red flags" items={r.risks} icon={AlertTriangle} tone="danger" />

      {r.product_matches?.length ? (
        <section className="space-y-1.5">
          <h3 className="text-[13px] font-semibold">Products that fit</h3>
          <ul className="space-y-1.5">
            {r.product_matches.map((m, i) => (
              <li key={i} className="text-[14px]">
                <span className="font-medium">{m.name}</span>{" "}
                <Badge tone={m.fit === "high" ? "success" : m.fit === "medium" ? "warning" : "neutral"}>
                  {m.fit} fit
                </Badge>
                {m.reason && <span className="block text-[13px] text-muted">{m.reason}</span>}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted">High-fit products are added to the lead&apos;s products automatically.</p>
        </section>
      ) : null}

      {r.recommended_next_action && (
        <InlineAlert tone="accent">
          <span className="font-medium">Suggested next step:</span> {r.recommended_next_action}
        </InlineAlert>
      )}
      <List title="Ask them" items={r.suggested_questions} icon={MessageCircleQuestion} tone="accent" />

      {(companyFacts.length > 0 || company?.description || r.contact?.summary) && (
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold">About them</h3>
          {company?.description && <p className="text-[14px]">{company.description}</p>}
          {companyFacts.length > 0 && (
            <dl className="grid gap-x-4 gap-y-1 text-[14px] sm:grid-cols-2">
              {companyFacts.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {company?.business_lines?.length ? (
            <p className="text-[13px] text-muted">Business lines: {company.business_lines.join(", ")}</p>
          ) : null}
          {company?.current_suppliers_or_origins?.length ? (
            <p className="text-[13px] text-muted">
              Buys from today: {company.current_suppliers_or_origins.join(", ")}
            </p>
          ) : null}
          {site && (
            <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[14px] text-accent hover:underline">
              {company?.website}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
          {r.contact && (r.contact.role || r.contact.summary) && (
            <p className="text-[14px]">
              <span className="text-muted">The contact: </span>
              {[r.contact.role, r.contact.seniority].filter(Boolean).join(", ")}
              {r.contact.summary && <> — {r.contact.summary}</>}
            </p>
          )}
        </section>
      )}

      <section className="space-y-1.5">
        <h3 className="text-[13px] font-semibold">Sources</h3>
        {r.sources?.length ? (
          <ul className="space-y-1">
            {r.sources.map((s, i) => {
              const href = safeHttpUrl(s.url);
              return (
                <li key={i} className="text-[14px]">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-accent hover:underline">
                      {s.title || s.url}
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    <span className="break-all text-muted">{s.title || s.url}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">No sources were given — treat this as unverified.</p>
        )}
      </section>
    </div>
  );
}

function HistoryDialog({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const q = useResearchHistory(leadId, true);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Previous research" description="Every run on this lead, newest first.">
        {q.isPending ? (
          <p className="text-[14px] text-muted">Loading…</p>
        ) : (
          <ul className="divide-y divide-line">
            {(q.data ?? []).map((run) => (
              <li key={run.id} className="py-2.5 text-[14px]">
                <span className="font-medium">
                  {run.status === "completed" ? `Score ${run.score ?? run.result?.score ?? "—"}` : run.status === "failed" ? "Failed" : "In progress"}
                </span>{" "}
                <span className="text-muted">· {formatDateTime(run.completed_at ?? run.created_at)}</span>
                {run.result?.headline && <span className="block text-[13px] text-muted">{run.result.headline}</span>}
                {run.error && <span className="block text-[13px] text-danger">{run.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * AI qualification (`research.result`). Worded as a suggestion throughout: the person's own
 * Hot/Warm/Cold rating stays theirs, with a one-click "Use AI rating".
 */
export function QualificationPanel({
  lead,
  research,
  canWrite,
}: {
  lead: Lead;
  research: Research | null;
  canWrite: boolean;
}) {
  const request = useRequestResearch(lead.id);
  const [history, setHistory] = React.useState(false);
  const status = research?.status;
  const running = status === "requested" || status === "processing";
  return (
    <Card role="region" aria-labelledby="qualification-title">
      <CardHeader>
        <CardTitle id="qualification-title" className="flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden />
          AI qualification
        </CardTitle>
        <div className="flex gap-1">
          {research && (
            <Button variant="ghost" size="sm" onClick={() => setHistory(true)}>
              <History aria-hidden />
              History
            </Button>
          )}
          {canWrite && status === "completed" && (
            <Button variant="ghost" size="sm" loading={request.isPending} onClick={() => request.mutate(true)}>
              <RefreshCw aria-hidden />
              Research again
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {!research ? (
          <EmptyState
            icon={Sparkles}
            className="py-6"
            title="Not researched yet"
            description="Research looks up the company and the person in public sources, checks product fit and suggests a score."
            action={
              canWrite ? (
                <Button loading={request.isPending} onClick={() => request.mutate(false)}>
                  <Sparkles aria-hidden />
                  Research this lead
                </Button>
              ) : undefined
            }
          />
        ) : running ? (
          <div role="status" className="flex items-start gap-3 py-2">
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-accent" aria-hidden />
            <div>
              <p className="text-[15px] font-medium">Researching… (usually a few minutes)</p>
              <p className="text-[13px] text-muted">
                Requested {formatRelative(research.created_at)}. This page updates by itself.
              </p>
            </div>
          </div>
        ) : status === "failed" ? (
          <div className="space-y-3">
            <InlineAlert>
              <span className="font-medium">Research failed.</span> {research.error ?? "No reason was given."}
            </InlineAlert>
            {canWrite && (
              <Button variant="secondary" loading={request.isPending} onClick={() => request.mutate(true)}>
                <RefreshCw aria-hidden />
                Try again
              </Button>
            )}
          </div>
        ) : research.result ? (
          <>
            <Completed run={research} lead={lead} canWrite={canWrite} />
            <p className="mt-5 border-t border-line pt-3 text-[12px] text-muted">
              AI suggestion from public information, researched {formatRelative(research.completed_at ?? research.updated_at)}. Check
              the sources before relying on it.
            </p>
          </>
        ) : (
          <p className="text-[14px] text-muted">Research finished without a result.</p>
        )}
      </CardBody>
      {history && <HistoryDialog leadId={lead.id} onClose={() => setHistory(false)} />}
    </Card>
  );
}
