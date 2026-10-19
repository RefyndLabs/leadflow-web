"use client";

import * as React from "react";
import { Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { describeError } from "@/lib/api/errors";
import { useLeadNoteMutations } from "@/lib/api/hooks";
import type { LeadNote, LeadNoteKind } from "@/lib/api/types";
import { LEAD_NOTE_KIND_LABEL } from "@/lib/enums";
import { formatDateTime, formatRelative, isPast, toLocalInput } from "@/lib/format";
import { localInputToIso } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, InlineAlert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { UserName } from "./entities";

const isOverdue = (n: LeadNote) =>
  n.kind === "commitment" &&
  !n.completed_at &&
  isPast(n.due_at);

/** Add or edit a note / promise. Promises can carry a due date (it can pull the next follow-up earlier). */
function NoteEditor({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial?: LeadNote;
  onSave: (v: { kind: LeadNoteKind; body: string; due_at: string | null; pinned: boolean }) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
}) {
  const [kind, setKind] = React.useState<LeadNoteKind>(initial?.kind ?? "note");
  const [body, setBody] = React.useState(initial?.body ?? "");
  const [due, setDue] = React.useState(toLocalInput(initial?.due_at));
  const [pinned, setPinned] = React.useState(initial?.pinned ?? false);
  const [error, setError] = React.useState<string | null>(null);
  const editing = Boolean(initial);
  return (
    <form
      noValidate
      className="space-y-3 rounded-[12px] border border-line p-3.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return setError("Write something first");
        setError(null);
        await onSave({
          kind,
          body: body.trim(),
          due_at: kind === "commitment" && due ? (localInputToIso(due) as string) : null,
          pinned,
        });
      }}
    >
      {!editing && (
        <Segmented<LeadNoteKind>
          label="Kind of note"
          value={kind}
          onValueChange={setKind}
          options={[
            { value: "note", label: "Note" },
            { value: "commitment", label: "Promise" },
          ]}
        />
      )}
      <Field label={kind === "commitment" ? "What we promised" : "Note"} required error={error ?? undefined}>
        <Textarea
          rows={3}
          maxLength={20000}
          value={body}
          autoFocus
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "commitment" ? "e.g. Send EU Organic certificate and COA" : "What should the team know?"}
        />
      </Field>
      {kind === "commitment" && (
        <Field label="Due" hint="A due date moves the lead's next follow-up earlier if it's sooner.">
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-[14px]">
        <Checkbox checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Pin to the top
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          {editing ? "Save" : kind === "commitment" ? "Add promise" : "Add note"}
        </Button>
      </div>
    </form>
  );
}

function NoteItem({ note, leadId, canWrite }: { note: LeadNote; leadId: string; canWrite: boolean }) {
  const { update, remove } = useLeadNoteMutations(leadId);
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const promise = note.kind === "commitment";
  // Ticking a promise shows straight away; the server's answer (or a failure) settles it.
  const [ticking, setTicking] = React.useState<boolean | null>(null);
  const saved = Boolean(note.completed_at);
  const done = ticking ?? saved;
  // Once the refetched note agrees, the optimistic value has done its job.
  if (ticking !== null && ticking === saved) setTicking(null);
  const overdue = isOverdue(note);

  const patch = async (body: Record<string, unknown>, ok?: string) => {
    try {
      await update.mutateAsync({ id: note.id, body });
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error(describeError(e));
      return false;
    }
  };

  if (editing)
    return (
      <li>
        <NoteEditor
          initial={note}
          pending={update.isPending}
          onCancel={() => setEditing(false)}
          onSave={async (v) => {
            await patch({ body: v.body, pinned: v.pinned, ...(promise ? { due_at: v.due_at } : {}) }, "Saved");
            setEditing(false);
          }}
        />
      </li>
    );

  return (
    <li className={cn("rounded-[12px] border p-3.5", note.pinned ? "border-accent/50" : "border-line")}>
      <div className="flex items-start gap-3">
        {promise && (
          <Checkbox
            className="mt-0.5"
            aria-label={done ? `Re-open: ${note.body}` : `Mark done: ${note.body}`}
            checked={done}
            disabled={!canWrite || update.isPending}
            onChange={async (e) => {
              const next = e.target.checked;
              setTicking(next);
              if (!(await patch({ completed: next }, next ? "Promise kept ✓" : "Re-opened")))
                setTicking(null);
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={promise ? (overdue ? "danger" : "warning") : note.kind === "conversation_summary" ? "accent" : "neutral"}>
              {LEAD_NOTE_KIND_LABEL[note.kind]}
            </Badge>
            {note.pinned && (
              <Badge>
                <Pin className="size-3" aria-hidden />
                Pinned
              </Badge>
            )}
            {promise && note.due_at && (
              <span className={cn("text-[12px]", overdue ? "font-medium text-danger" : "text-muted")}>
                {done ? "Done" : overdue ? "Overdue" : "Due"} {done ? formatRelative(note.completed_at) : formatDateTime(note.due_at)}
              </span>
            )}
          </div>
          <p className={cn("whitespace-pre-wrap break-words text-[14px]", done && "text-muted line-through")}>{note.body}</p>
          <p className="mt-1 text-[12px] text-muted">
            {note.author_user_id ? <UserName id={note.author_user_id} /> : "From the capture"} · {formatRelative(note.created_at)}
          </p>
        </div>
        {canWrite && (
          <div className="flex shrink-0 gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-9 sm:size-8"
              aria-label={note.pinned ? "Unpin" : "Pin"}
              onClick={() => void patch({ pinned: !note.pinned })}
            >
              {note.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
            </Button>
            <Button variant="ghost" size="icon" className="size-9 sm:size-8" aria-label="Edit" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 sm:size-8"
              aria-label="Delete"
              onClick={async () => {
                if (
                  await confirm({
                    title: promise ? "Delete this promise?" : "Delete this note?",
                    confirmLabel: "Delete",
                    destructive: true,
                  })
                )
                  remove.mutate(note.id);
              }}
            >
              <Trash2 className="text-danger" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

export function NotesPanel({ leadId, notes, canWrite }: { leadId: string; notes: LeadNote[]; canWrite: boolean }) {
  const { create } = useLeadNoteMutations(leadId);
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const open = notes.filter((n) => n.kind === "commitment" && !n.completed_at).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Notes and promises
          {open > 0 && <span className="ml-2 normal-case tracking-normal text-warning">{open} open</span>}
        </CardTitle>
        {canWrite && !adding && (
          <Button variant="ghost" size="sm" aria-label="Add a note or promise" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {error && <InlineAlert>{error}</InlineAlert>}
        {adding && (
          <NoteEditor
            pending={create.isPending}
            onCancel={() => setAdding(false)}
            onSave={async (v) => {
              setError(null);
              try {
                await create.mutateAsync({
                  kind: v.kind,
                  body: v.body,
                  pinned: v.pinned,
                  ...(v.due_at ? { due_at: v.due_at } : {}),
                });
                toast.success(v.kind === "commitment" ? "Promise added" : "Note added");
                setAdding(false);
              } catch (e) {
                setError(describeError(e));
              }
            }}
          />
        )}
        {notes.length === 0 && !adding ? (
          <EmptyState
            className="py-6"
            title="No notes yet"
            description="Keep what was discussed and what we promised here, so anyone can pick it up."
          />
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <NoteItem key={n.id} note={n} leadId={leadId} canWrite={canWrite} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
