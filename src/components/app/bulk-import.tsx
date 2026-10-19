"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  XCircle,
} from "lucide-react";
import { newIdempotencyKey } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import { useBulkIngest } from "@/lib/api/hooks";
import type { BulkIngestResult } from "@/lib/api/types";
import {
  BULK_CHUNK,
  MAX_FILE_BYTES,
  MAX_ROWS,
  buildPayloads,
  parseCsv,
  sheetToRecords,
  templateCsv,
  type ParsedSheet,
} from "@/lib/import";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Stage = "input" | "preview" | "done";

interface ChunkResult {
  offset: number;
  rows: number[]; // original row numbers, aligned with the chunk
  data?: BulkIngestResult;
  error?: string;
}

function downloadTemplate() {
  const url = URL.createObjectURL(
    new Blob([templateCsv()], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "leadflow-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkImport() {
  const [stage, setStage] = React.useState<Stage>("input");
  const [text, setText] = React.useState("");
  const [sheet, setSheet] = React.useState<ParsedSheet | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<ChunkResult[]>([]);
  const [progress, setProgress] = React.useState<{
    done: number;
    total: number;
  } | null>(null);
  const bulk = useBulkIngest({ handled: true });
  // One idempotency key per chunk for this import session, so a retry of the same chunk can never double-create.
  const keys = React.useRef<Map<number, string>>(new Map());

  const loadRecords = (
    records: Record<string, unknown>[],
    headers: string[],
  ) => {
    if (records.length === 0)
      return setFileError(
        "No rows found. Make sure the first row holds the column headers.",
      );
    if (records.length > MAX_ROWS)
      return setFileError(
        `That's ${records.length} rows. Import up to ${MAX_ROWS} at a time.`,
      );
    setFileError(null);
    setSheet(buildPayloads(records, headers));
    setStage("preview");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_FILE_BYTES)
      return setFileError(
        "That file is over 5 MB. Split it into smaller files.",
      );
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const { records, headers } = sheetToRecords(
          (await readSheet(file)) as unknown[][],
        );
        loadRecords(records, headers);
      } else if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        const { records, headers } = parseCsv(await file.text());
        loadRecords(records, headers);
      } else {
        setFileError(
          "Use a .csv or .xlsx file. (Older .xls files need to be re-saved as .xlsx.)",
        );
      }
    } catch {
      setFileError(
        "That file couldn't be read. Check it opens in a spreadsheet app, then try again.",
      );
    }
  };

  const valid = sheet?.rows.filter((r) => r.payload) ?? [];
  const invalid = sheet?.rows.filter((r) => !r.payload) ?? [];

  const submit = async () => {
    const chunks: { offset: number; rows: typeof valid }[] = [];
    for (let i = 0; i < valid.length; i += BULK_CHUNK)
      chunks.push({ offset: i, rows: valid.slice(i, i + BULK_CHUNK) });
    setResults([]);
    setProgress({ done: 0, total: valid.length });
    const acc: ChunkResult[] = [];
    for (const [ci, chunk] of chunks.entries()) {
      if (!keys.current.has(ci)) keys.current.set(ci, newIdempotencyKey());
      try {
        const data = await bulk.mutateAsync({
          rows: chunk.rows.map((r) => r.payload!),
          key: keys.current.get(ci)!,
        });
        acc.push({
          offset: chunk.offset,
          rows: chunk.rows.map((r) => r.row),
          data,
        });
      } catch (e) {
        acc.push({
          offset: chunk.offset,
          rows: chunk.rows.map((r) => r.row),
          error: describeError(e),
        });
      }
      setResults([...acc]);
      setProgress({
        done: Math.min(valid.length, chunk.offset + chunk.rows.length),
        total: valid.length,
      });
    }
    setProgress(null);
    setStage("done");
  };

  const reset = () => {
    setStage("input");
    setSheet(null);
    setText("");
    setResults([]);
    keys.current = new Map();
  };

  /* ── Step 1: input ─────────────────────────────────────────────── */
  if (stage === "input") {
    return (
      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-4">
            <label
              htmlFor="import-file"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border-2 border-dashed border-line-strong px-4 py-10 text-center transition-colors hover:border-accent hover:bg-accent-soft focus-within:border-accent"
            >
              <FileSpreadsheet className="size-8 text-muted" aria-hidden />
              <span className="text-[16px] font-medium">
                Choose a .csv or .xlsx file
              </span>
              <span className="text-[13px] text-muted">
                First row = column headers. Up to {MAX_ROWS.toLocaleString()}{" "}
                rows, 5 MB.
              </span>
              <input
                id="import-file"
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,text/csv"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            {fileError && <InlineAlert>{fileError}</InlineAlert>}
            <div className="flex flex-wrap items-center gap-2 text-[14px] text-muted">
              Need the format?
              <Button variant="link" onClick={downloadTemplate}>
                <Download aria-hidden />
                Download the template
              </Button>
            </div>
            <p className="text-[13px] text-muted">
              Optional columns are picked up too: WhatsApp, Country (two-letter
              code), Website, Buyer type, Requirement type, Volume, Destination,
              Timeline, Target price, Incoterm and Quality (hot / warm / cold).
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Or paste rows</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <Textarea
              aria-label="Pasted rows"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "contact_name,contact_phone,account_name,source\nAsha Rao,+91 98765 43210,Rao Textiles,website"
              }
              className="font-mono text-[13px]"
            />
            <Button
              variant="secondary"
              disabled={!text.trim()}
              onClick={() => {
                const { records, headers } = parseCsv(text);
                loadRecords(records, headers);
              }}
            >
              Preview pasted rows
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  /* ── Step 2: preview ───────────────────────────────────────────── */
  if (stage === "preview" && sheet) {
    return (
      <div className="space-y-4">
        {sheet.missing.length > 0 && (
          <InlineAlert>
            Missing required column{sheet.missing.length > 1 ? "s" : ""}:{" "}
            <span className="font-mono">{sheet.missing.join(", ")}</span>.
            Rename the headers in your file, or download the template.
          </InlineAlert>
        )}
        {sheet.ignored.length > 0 && (
          <InlineAlert tone="accent">
            Ignoring columns we don&apos;t use: {sheet.ignored.join(", ")}.
          </InlineAlert>
        )}
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px]">
              <span className="font-semibold tabular">{valid.length}</span>{" "}
              ready to import
              {invalid.length > 0 && (
                <>
                  ,{" "}
                  <span className="font-semibold text-danger tabular">
                    {invalid.length}
                  </span>{" "}
                  need fixing (they&apos;ll be skipped)
                </>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset}>
                Start over
              </Button>
              <Button
                disabled={valid.length === 0 || sheet.missing.length > 0}
                loading={Boolean(progress)}
                onClick={() => void submit()}
              >
                <Upload aria-hidden />
                Import {valid.length} lead{valid.length === 1 ? "" : "s"}
              </Button>
            </div>
          </CardBody>
        </Card>
        {progress && (
          <div role="status" aria-live="polite" className="space-y-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-[13px] text-muted tabular">
              Imported {progress.done} of {progress.total}…
            </p>
          </div>
        )}
        <Card className="overflow-hidden">
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-left text-[14px]">
              <caption className="sr-only">Rows to import</caption>
              <thead className="sticky top-0 bg-surface-2 text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Row</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sheet.rows.map((r) => (
                  <tr
                    key={r.row}
                    className={cn(!r.payload && "bg-danger-soft/50")}
                  >
                    <td className="px-4 py-2 tabular text-muted">{r.row}</td>
                    <td className="px-4 py-2">
                      {String(r.payload?.contact_name ?? "—")}
                    </td>
                    <td className="px-4 py-2">
                      {String(r.payload?.account_name ?? "—")}
                    </td>
                    <td className="px-4 py-2">
                      {String(r.payload?.source ?? "—")}
                    </td>
                    <td className="px-4 py-2">
                      {r.payload ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="size-4" aria-hidden />
                          OK
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1 text-danger">
                          <AlertTriangle
                            className="mt-0.5 size-4 shrink-0"
                            aria-hidden
                          />
                          <span>{r.errors.join("; ")}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  /* ── Step 3: results ───────────────────────────────────────────── */
  const flat = results.flatMap((c) =>
    c.data
      ? c.data.results.map((r) => ({
          row: c.rows[r.index] ?? r.index + 1,
          ok: r.ok,
          error: r.error ?? null,
          leadId: r.result?.lead_id ?? null,
          isNew: r.result?.is_new_lead ?? false,
        }))
      : c.rows.map((row) => ({
          row,
          ok: false,
          error: c.error ?? "Failed",
          leadId: null,
          isNew: false,
        })),
  );
  const created = flat.filter((r) => r.ok && r.isNew).length;
  const replies = flat.filter((r) => r.ok && !r.isNew).length;
  const failed = flat.filter((r) => !r.ok);
  const retryable = results.some((c) => c.error);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-[20px] font-semibold">Import finished</h2>
          <ul className="grid gap-2 sm:grid-cols-3">
            <li className="rounded-[10px] bg-success-soft px-3.5 py-3 text-success">
              <p className="text-[24px] font-semibold tabular">{created}</p>
              <p className="text-[13px]">new leads</p>
            </li>
            <li className="rounded-[10px] bg-accent-soft px-3.5 py-3 text-accent">
              <p className="text-[24px] font-semibold tabular">{replies}</p>
              <p className="text-[13px]">matched existing leads</p>
            </li>
            <li
              className={cn(
                "rounded-[10px] px-3.5 py-3",
                failed.length
                  ? "bg-danger-soft text-danger"
                  : "bg-surface-2 text-muted",
              )}
            >
              <p className="text-[24px] font-semibold tabular">
                {failed.length}
              </p>
              <p className="text-[13px]">failed</p>
            </li>
          </ul>
          {invalid.length > 0 && (
            <p className="text-[13px] text-muted">
              {invalid.length} row(s) were skipped before sending because they
              didn&apos;t validate.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild>
              <Link href="/leads">View leads</Link>
            </Button>
            {retryable && (
              <Button
                variant="secondary"
                loading={Boolean(progress)}
                onClick={() => void submit()}
              >
                Retry failed batches
              </Button>
            )}
            <Button variant="secondary" onClick={reset}>
              Import another file
            </Button>
          </div>
        </CardBody>
      </Card>

      {failed.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Failed rows</CardTitle>
          </CardHeader>
          <ul className="mt-3 divide-y divide-line">
            {failed.map((f) => (
              <li
                key={f.row}
                className="flex items-start gap-3 px-4 py-3 text-[14px] sm:px-5"
              >
                <XCircle
                  className="mt-0.5 size-4 shrink-0 text-danger"
                  aria-hidden
                />
                <span className="tabular text-muted">Row {f.row}</span>
                <span className="min-w-0 flex-1">{f.error}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
