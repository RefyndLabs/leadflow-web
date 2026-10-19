"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { LeadNoteCreate, LeadNoteKind } from "@/lib/api/types";
import { LEAD_NOTE_KIND_LABEL } from "@/lib/enums";
import { toLocalInput } from "@/lib/format";
import { localInputToIso } from "@/lib/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

/** A note not saved yet: the conversation summary and promises drafted from the voice note. */
export interface DraftNote {
  key: string;
  kind: LeadNoteKind;
  body: string;
  /** datetime-local value (local time) */
  due: string;
  pinned: boolean;
}

let seq = 0;
const nextKey = () => `n${++seq}`;

export function draftNotesFrom(notes: LeadNoteCreate[] | null | undefined): DraftNote[] {
  return (notes ?? []).map((n) => ({
    key: nextKey(),
    kind: n.kind ?? "note",
    body: n.body,
    due: toLocalInput(n.due_at),
    // The conversation summary is what anyone opening the lead should read first.
    pinned: n.pinned ?? n.kind === "conversation_summary",
  }));
}

/** Drafts → `notes[]` for confirm / ingest. Empty cards are dropped. */
export function notesPayload(list: DraftNote[]) {
  const notes = list
    .filter((n) => n.body.trim())
    .map((n) => ({
      kind: n.kind,
      body: n.body.trim(),
      ...(n.pinned ? { pinned: true } : {}),
      ...(n.kind === "commitment" && n.due ? { due_at: localInputToIso(n.due) as string } : {}),
    }));
  return notes.length ? { notes } : {};
}

/** Editable cards for the conversation summary and promises (hand-off §4.3 E). */
export function DraftNotesEditor({
  value,
  onChange,
  disabled,
}: {
  value: DraftNote[];
  onChange: (next: DraftNote[]) => void;
  disabled?: boolean;
}) {
  const update = (key: string, patch: Partial<DraftNote>) =>
    onChange(value.map((n) => (n.key === key ? { ...n, ...patch } : n)));
  const add = (kind: LeadNoteKind) =>
    onChange([...value, { key: nextKey(), kind, body: "", due: "", pinned: false }]);
  let promiseNo = 0;
  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-[14px] text-muted">
          No notes yet. Add what was discussed, or a promise with a due date — the earliest promise sets the first
          follow-up.
        </p>
      )}
      {value.map((n) => {
        const promise = n.kind === "commitment";
        const label = promise ? `Promise ${++promiseNo}` : LEAD_NOTE_KIND_LABEL[n.kind];
        return (
          <div key={n.key} className="space-y-2 rounded-[12px] border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge tone={promise ? "warning" : n.kind === "conversation_summary" ? "accent" : "neutral"}>{label}</Badge>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 sm:size-8"
                aria-label={`Remove ${label.toLowerCase()}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x.key !== n.key))}
              >
                <Trash2 className="text-danger" aria-hidden />
              </Button>
            </div>
            <Textarea
              aria-label={label}
              rows={n.kind === "conversation_summary" ? 6 : 2}
              maxLength={20000}
              disabled={disabled}
              value={n.body}
              onChange={(e) => update(n.key, { body: e.target.value })}
              placeholder={promise ? "What we promised, e.g. send COA and price list" : "What should the team know?"}
            />
            {promise && (
              <label className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-muted">Due</span>
                <Input
                  type="datetime-local"
                  className="w-auto"
                  aria-label={`${label} due`}
                  disabled={disabled}
                  value={n.due}
                  onChange={(e) => update(n.key, { due: e.target.value })}
                />
              </label>
            )}
          </div>
        );
      })}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => add("note")}>
            <Plus aria-hidden />
            Add note
          </Button>
          <Button variant="secondary" size="sm" onClick={() => add("commitment")}>
            <Plus aria-hidden />
            Add promise
          </Button>
        </div>
      )}
    </div>
  );
}
