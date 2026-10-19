"use client";

import * as React from "react";
import { ChevronDown, History } from "lucide-react";
import { useAuditLogs, users } from "@/lib/api/hooks";
import { formatDateTime } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { PageHeader } from "./page-header";

const MAX_JSON = 6000;

/** Local date → the start/end of that day as UTC ISO strings for the API's from/to filters. */
function dayBound(value: string, end: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function AuditLog() {
  const url = useUrlState();
  const f = {
    action: url.get("action"),
    entity_type: url.get("entity_type"),
    entity_id: url.get("entity_id"),
    actor_id: url.get("actor_id"),
    from: url.get("from"),
    to: url.get("to"),
  };
  const team = users.useList({ limit: 200 });
  const validId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      f.entity_id,
    );
  const q = useAuditLogs({
    action: f.action || undefined,
    entity_type: f.entity_type || undefined,
    entity_id: validId ? f.entity_id : undefined,
    actor_id: f.actor_id || undefined,
    occurred_from: dayBound(f.from, false),
    occurred_to: dayBound(f.to, true),
    skip: url.skip,
    limit: PAGE_SIZE,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change and sign-in, who made it and when. Read-only."
      />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Action" hint="Exact, or end with * (auth.*)">
          <Input
            value={f.action}
            maxLength={100}
            placeholder="auth.*"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => url.set({ action: e.target.value.trim() })}
          />
        </Field>
        <Field label="Record type">
          <Input
            value={f.entity_type}
            maxLength={100}
            placeholder="lead"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => url.set({ entity_type: e.target.value.trim() })}
          />
        </Field>
        <Field
          label="Record ID"
          error={f.entity_id && !validId ? "Paste a full record ID" : undefined}
        >
          <Input
            value={f.entity_id}
            maxLength={36}
            placeholder="Paste a record ID"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => url.set({ entity_id: e.target.value.trim() })}
          />
        </Field>
        <Field label="Person">
          <Select
            value={f.actor_id}
            onChange={(e) => url.set({ actor_id: e.target.value })}
          >
            <option value="">Anyone</option>
            {team.data?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={f.from}
            onChange={(e) => url.set({ from: e.target.value })}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={f.to}
            onChange={(e) => url.set({ to: e.target.value })}
          />
        </Field>
      </Card>

      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={History}
            title="No matching activity"
            description="Try widening the dates or clearing a filter."
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {q.data.items.map((l) => {
                const json = l.changes
                  ? JSON.stringify(l.changes, null, 2)
                  : null;
                return (
                  <li key={l.id} className="px-4 py-3 sm:px-5">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-[14px]">
                            <span className="font-mono font-medium">
                              {l.action}
                            </span>
                            {l.entity_type && <Badge>{l.entity_type}</Badge>}
                          </p>
                          <p className="text-[13px] text-muted">
                            {l.actor_label ?? l.actor_type} ({l.actor_type}) ·{" "}
                            <time dateTime={l.occurred_at}>
                              {formatDateTime(l.occurred_at)}
                            </time>
                          </p>
                        </div>
                        {json && (
                          <ChevronDown
                            className="mt-1 size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                            aria-hidden
                          />
                        )}
                        {json && <span className="sr-only">Show changes</span>}
                      </summary>
                      <div className="mt-3 space-y-2 rounded-[10px] bg-surface-2 p-3 text-[12px]">
                        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                          {l.entity_id && (
                            <>
                              <dt className="text-muted">Record</dt>
                              <dd className="break-all font-mono">
                                {l.entity_id}
                              </dd>
                            </>
                          )}
                          {l.request_id && (
                            <>
                              <dt className="text-muted">Request</dt>
                              <dd className="break-all font-mono">
                                {l.request_id}
                              </dd>
                            </>
                          )}
                          {l.ip_address && (
                            <>
                              <dt className="text-muted">IP</dt>
                              <dd className="font-mono">{l.ip_address}</dd>
                            </>
                          )}
                        </dl>
                        {json && (
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono">
                            {json.length > MAX_JSON
                              ? `${json.slice(0, MAX_JSON)}\n… (truncated)`
                              : json}
                          </pre>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            <Pagination
              skip={url.skip}
              total={q.data.total}
              count={q.data.items.length}
              onChange={(s) => url.set({ skip: s || null }, { keepSkip: true })}
              noun="events"
            />
          </>
        )}
      </Card>
    </>
  );
}
