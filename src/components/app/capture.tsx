"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import { events, useCurrentEvents } from "@/lib/api/hooks";
import type { Capture, CurrentEvents, EventRecord } from "@/lib/api/types";
import { uploadCaptureFile, type CaptureFileKind } from "@/lib/capture-media";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, InlineAlert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import {
  CardPicker,
  VoiceRecorder,
  release,
  type Picked,
} from "./capture-inputs";
import { useAuth } from "./auth";
import { PageHeader } from "./page-header";
import { ShowHeader } from "./show-header";

const LAST_EVENT_KEY = "lf-capture-event";
/** Select value meaning "not from a show" (office visit, walk-in, meeting) — saved as In person. */
const NO_SHOW = "none";

type FileKey = "card" | "cardBack" | "voice";
type StepKey = "create" | FileKey | "submit";
type StepState = "pending" | "active" | "done" | "error";

const STEP_LABEL: Record<StepKey, string> = {
  create: "Starting the capture",
  card: "Uploading the card photo",
  cardBack: "Uploading the back of the card",
  voice: "Uploading the voice note",
  submit: "Sending it to be read",
};

const FILE_KINDS: Record<FileKey, CaptureFileKind> = {
  card: "card",
  cardBack: "card-back",
  voice: "voice",
};
const FILE_NAMES: Record<FileKey, string> = {
  card: "card.jpg",
  cardBack: "card-back.jpg",
  voice: "voice-note",
};
const NO_FILES: Record<FileKey, boolean> = {
  card: false,
  cardBack: false,
  voice: false,
};

function StepTitle({
  n,
  title,
  hint,
}: {
  n: number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <span
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background"
        aria-hidden
      >
        {n}
      </span>
      <div>
        <h2 className="text-[17px] font-semibold leading-tight">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Which show to pre-select. A show given in the link wins; then the remembered show if it is still on;
 * then the API's suggestion (the one ongoing show the person works, or the only show running);
 * then the remembered show anyway. The person can always change it.
 */
export function pickShow(
  fromLink: string,
  remembered: string,
  current: CurrentEvents | undefined,
): string {
  if (fromLink) return fromLink;
  const ongoing = current?.events.filter((e) => e.timing === "ongoing") ?? [];
  if (remembered && ongoing.some((e) => e.id === remembered)) return remembered;
  if (current?.suggested_event_id) return current.suggested_event_id;
  return remembered;
}

function readLastEvent(): string {
  try {
    return localStorage.getItem(LAST_EVENT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function CaptureScreen() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const link = useSearchParams().get("event") ?? "";
  const evs = events.useList({ limit: 200 });
  const current = useCurrentEvents();
  const [remembered] = React.useState<string>(() =>
    typeof window === "undefined" ? "" : readLastEvent(),
  );
  // An explicit pick (this session) beats the automatic one, which waits for /events/current.
  const [picked, setPicked] = React.useState<string | null>(null);
  const known = (id: string) =>
    id === NO_SHOW || Boolean(evs.data?.items.some((e) => e.id === id) || current.data?.events.some((e) => e.id === id));
  const auto = current.isPending ? "" : pickShow(known(link) ? link : "", remembered, current.data);
  const eventId = picked ?? (auto && (evs.isPending || known(auto)) ? auto : "");
  const ongoing = current.data?.events.filter((e) => e.timing === "ongoing") ?? [];
  const onTeam = (e: EventRecord) => (e.members ?? []).some((m) => m.user_id === me.id);
  const others = (evs.data?.items ?? []).filter((e) => !ongoing.some((o) => o.id === e.id));
  const selected =
    eventId && eventId !== NO_SHOW
      ? (ongoing.find((e) => e.id === eventId) ?? evs.data?.items.find((e) => e.id === eventId))
      : null;
  const [note, setNote] = React.useState("");
  const [card, setCard] = React.useState<Picked | null>(null);
  // The back of the card is optional: its slot opens on request, so one-sided cards stay one tap.
  const [cardBack, setCardBack] = React.useState<Picked | null>(null);
  const [backOpen, setBackOpen] = React.useState(false);
  const [voice, setVoice] = React.useState<Picked | null>(null);

  const [phase, setPhase] = React.useState<
    "edit" | "saving" | "failed" | "saved"
  >("edit");
  const [steps, setSteps] = React.useState<Partial<Record<StepKey, StepState>>>(
    {},
  );
  const [progress, setProgress] = React.useState<Record<FileKey, number>>({
    card: 0,
    cardBack: 0,
    voice: 0,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [savedId, setSavedId] = React.useState<string | null>(null);

  // What has already reached the server, so Retry resumes instead of starting over (and never double-creates).
  // `sent`: the server holds the file shown here. `held`: the server holds some file in that slot
  // (removed here after a failed attempt → it is deleted on Retry).
  const server = React.useRef<{
    id: string | null;
    sent: Record<FileKey, boolean>;
    held: Record<FileKey, boolean>;
    submitted: boolean;
    note: string;
    eventId: string;
  }>({
    id: null,
    sent: { ...NO_FILES },
    held: { ...NO_FILES },
    submitted: false,
    note: "",
    eventId: "",
  });
  const latest = React.useRef({ card, cardBack, voice });
  React.useEffect(() => {
    latest.current = { card, cardBack, voice };
  }, [card, cardBack, voice]);
  React.useEffect(
    () => () => {
      release(latest.current.card);
      release(latest.current.cardBack);
      release(latest.current.voice);
    },
    [],
  );

  const eventsLoaded = evs.isSuccess;
  const noEvents = eventsLoaded && evs.data.items.length === 0;
  const hasAnything = Boolean(card || cardBack || voice || note.trim());
  const needsFiles = Boolean(card || cardBack || voice);
  const showBack = backOpen || Boolean(cardBack);
  const canSave =
    hasAnything && (Boolean(eventId) || noEvents) && phase !== "saving";

  const chooseEvent = (id: string) => {
    setPicked(id);
    try {
      if (id) localStorage.setItem(LAST_EVENT_KEY, id);
    } catch {
      /* remembering the show is a nicety */
    }
  };

  const setStep = (k: StepKey, s: StepState) =>
    setSteps((prev) => ({ ...prev, [k]: s }));

  const save = async () => {
    setPhase("saving");
    setError(null);
    let current: StepKey = "create";
    try {
      const s = server.current;
      if (!s.id) {
        setStep("create", "active");
        const created = await api<Capture>("/captures", {
          method: "POST",
          body: {
            ...(eventId && eventId !== NO_SHOW ? { event_id: eventId } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        });
        s.id = created.id;
        s.note = note.trim();
        s.eventId = eventId;
      } else if (s.note !== note.trim() || s.eventId !== eventId) {
        // They fixed the show or note after a failed attempt.
        await api<Capture>(`/captures/${s.id}`, {
          method: "PATCH",
          body: {
            event_id: eventId && eventId !== NO_SHOW ? eventId : null,
            note: note.trim() || null,
          },
        });
        s.note = note.trim();
        s.eventId = eventId;
      }
      setStep("create", "done");

      const local: Record<FileKey, Picked | null> = { card, cardBack, voice };
      for (const k of ["card", "cardBack", "voice"] as const) {
        const file = local[k];
        if (file && !s.sent[k]) {
          current = k;
          setStep(k, "active");
          await uploadCaptureFile(s.id, FILE_KINDS[k], file.blob, FILE_NAMES[k], (p) =>
            setProgress((x) => ({ ...x, [k]: p })),
          );
          s.sent[k] = true;
          s.held[k] = true;
          setStep(k, "done");
        } else if (!file && s.held[k]) {
          // Uploaded on an earlier attempt, then removed here: take it off the capture too.
          current = k;
          await api<void>(`/captures/${s.id}/${FILE_KINDS[k]}`, {
            method: "DELETE",
          });
          s.held[k] = false;
        }
      }
      if (needsFiles && !s.submitted) {
        current = "submit";
        setStep("submit", "active");
        await api<Capture>(`/captures/${s.id}/submit`, { method: "POST" });
        s.submitted = true;
        setStep("submit", "done");
      }
      void qc.invalidateQueries({ queryKey: ["captures"] });
      setSavedId(s.id);
      setPhase("saved");
    } catch (e) {
      setStep(current, "error");
      setError(describeError(e)); // the API's own wording for 415 / 413 / 422, shown as written
      setPhase("failed");
    }
  };

  const reset = () => {
    release(card);
    release(cardBack);
    release(voice);
    setCard(null);
    setCardBack(null);
    setBackOpen(false);
    setVoice(null);
    setNote("");
    setSteps({});
    setProgress({ card: 0, cardBack: 0, voice: 0 });
    setError(null);
    setSavedId(null);
    server.current = {
      id: null,
      sent: { ...NO_FILES },
      held: { ...NO_FILES },
      submitted: false,
      note: "",
      eventId: "",
    }; // the show stays selected
    setPhase("edit");
  };

  // Changing a file after it was already uploaded means it must be uploaded again.
  const changeCard = (p: Picked | null) => {
    server.current.sent.card = false;
    setCard(p);
  };
  const changeCardBack = (p: Picked | null) => {
    server.current.sent.cardBack = false;
    setCardBack(p);
  };
  const changeVoice = (p: Picked | null) => {
    server.current.sent.voice = false;
    setVoice(p);
  };

  if (phase === "saved") {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Capture at a show" />
        <Card>
          <CardBody className="space-y-4 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-7" aria-hidden />
            </div>
            <div role="status">
              <h2 className="text-[22px] font-semibold">Saved ✓</h2>
              <p className="mx-auto mt-1 max-w-md text-[14px] text-muted">
                {needsFiles
                  ? "We're reading the card and the voice note now. You can keep going — find it under Captures when it's ready to check."
                  : "Saved without a photo or recording. Open it from Captures to add the details by hand."}
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <Button size="lg" onClick={reset}>
                <Plus aria-hidden />
                Capture another
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link href={savedId ? `/captures/${savedId}` : "/captures"}>
                  Open this capture
                </Link>
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const locked = phase === "saving";
  const stepKeys: StepKey[] = [
    "create",
    ...(card ? (["card"] as const) : []),
    ...(cardBack ? (["cardBack"] as const) : []),
    ...(voice ? (["voice"] as const) : []),
    ...(needsFiles ? (["submit"] as const) : []),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Capture at a show"
        description="Photograph the card, say what they want, tap Done. We'll read it and you check it later."
      />

      <div className="space-y-4">
        <Card>
          <CardBody>
            <StepTitle n={1} title="Which show?" />
            {noEvents ? (
              <EmptyState
                title="No exhibitions yet"
                description="Add the show first so captures can be tagged to it. You can also continue without one."
                className="py-4"
              />
            ) : (
              <Field label="Exhibition" required>
                <Select
                  value={eventId}
                  disabled={locked}
                  onChange={(e) => chooseEvent(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {ongoing.length > 0 && (
                    <optgroup label="Happening now">
                      {ongoing.map((e) => (
                        <option key={e.id} value={e.id}>
                          {onTeam(e) ? `${e.name} — you're on the team` : e.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value={NO_SHOW}>
                    Not from a show — office visit, walk-in, meeting
                  </option>
                  {others.length > 0 && (
                    <optgroup label={ongoing.length > 0 ? "Other exhibitions" : "Exhibitions"}>
                      {others.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </Field>
            )}
            {(selected || eventId === NO_SHOW) && (
              <ShowHeader event={selected ?? null} className="mt-3" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <StepTitle
              n={2}
              title="Business card"
              hint="Optional — a clear photo, flat, with the text readable. Printed on both sides? Add the back too."
            />
            {showBack && (
              <h3 className="mb-2 text-[14px] font-medium">Front of card</h3>
            )}
            <CardPicker value={card} onChange={changeCard} disabled={locked} />
            {showBack ? (
              <div className="mt-4 border-t border-line pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[14px] font-medium">
                    Back of card{" "}
                    <span className="font-normal text-muted">(optional)</span>
                  </h3>
                  {!cardBack && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={locked}
                      onClick={() => setBackOpen(false)}
                    >
                      Not needed
                    </Button>
                  )}
                </div>
                <CardPicker
                  side="back"
                  value={cardBack}
                  onChange={changeCardBack}
                  onRemove={() => {
                    changeCardBack(null);
                    setBackOpen(false);
                  }}
                  disabled={locked}
                />
              </div>
            ) : (
              card && (
                <Button
                  variant="tint"
                  size="sm"
                  className="mt-3"
                  disabled={locked}
                  onClick={() => setBackOpen(true)}
                >
                  <Plus aria-hidden />
                  Add the back of the card
                </Button>
              )
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <StepTitle
              n={3}
              title="Voice note"
              hint="Optional — what do they want? Any language."
            />
            <VoiceRecorder
              value={voice}
              onChange={changeVoice}
              disabled={locked}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Field
              label="Quick note"
              hint="Optional. One line, e.g. “wants samples before the 15th”."
            >
              <Input
                maxLength={4000}
                value={note}
                disabled={locked}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </CardBody>
        </Card>

        {(phase === "saving" || phase === "failed") && (
          <Card>
            <CardBody className="space-y-3">
              <ul className="space-y-2" aria-label="Progress">
                {stepKeys.map((k) => {
                  const s = steps[k] ?? "pending";
                  const pct =
                    k === "card" || k === "cardBack" || k === "voice"
                      ? progress[k]
                      : null;
                  const label =
                    k === "card" && cardBack
                      ? "Uploading the front of the card"
                      : STEP_LABEL[k];
                  return (
                    <li key={k} className="flex items-center gap-3 text-[14px]">
                      {s === "done" ? (
                        <Check className="size-5 text-success" aria-hidden />
                      ) : s === "active" ? (
                        <Loader2
                          className="size-5 animate-spin text-accent"
                          aria-hidden
                        />
                      ) : s === "error" ? (
                        <AlertTriangle
                          className="size-5 text-danger"
                          aria-hidden
                        />
                      ) : (
                        <Circle
                          className="size-5 text-line-strong"
                          aria-hidden
                        />
                      )}
                      <span
                        className={
                          s === "error"
                            ? "text-danger"
                            : s === "pending"
                              ? "text-muted"
                              : undefined
                        }
                      >
                        {label}
                        {s === "active" &&
                          pct !== null &&
                          ` — ${Math.round(pct * 100)}%`}
                        {s === "done" && " ✓"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {phase === "failed" && error && (
                <InlineAlert>
                  <p>{error}</p>
                  <p className="mt-1 text-[13px]">
                    Your photo and recording are still here — nothing is lost.
                    Tap Retry to continue.
                  </p>
                </InlineAlert>
              )}
            </CardBody>
          </Card>
        )}

        <Button
          size="lg"
          className="h-14 w-full text-[17px] sm:h-12"
          disabled={!canSave}
          loading={phase === "saving"}
          onClick={() => void save()}
        >
          {phase === "failed" ? "Retry" : "Done"}
        </Button>
        {!hasAnything && (
          <p className="text-center text-[13px] text-muted">
            Add a photo, a voice note or a note to continue.
          </p>
        )}
        {hasAnything && !eventId && !noEvents && (
          <p className="text-center text-[13px] text-muted">
            Choose the show first.
          </p>
        )}
      </div>
    </div>
  );
}
