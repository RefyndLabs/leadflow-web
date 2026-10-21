"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ApiError, describeError } from "@/lib/api/errors";
import {
  events,
  products,
  useCapture,
  useCaptureActions,
  useCaptureDuplicates,
  useCardBack,
} from "@/lib/api/hooks";
import type { Capture, CaptureConfirmDraft } from "@/lib/api/types";
import { CAPTURE_LABEL, READING_STATUSES } from "@/lib/enums";
import { splitPhones } from "@/lib/capture-media";
import { countryOptions } from "@/lib/countries";
import { formatDateTime, formatRelative, toLocalInput } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { UNASSIGNED, captureConfirm } from "@/lib/schemas";
import { useDebounced } from "@/lib/use-debounced";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { ErrorState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { Field, FieldGroup } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { AudioPlayer, attachmentSrc } from "./attachments";
import { useAuth } from "./auth";
import { CaptureBadge } from "./capture-badge";
import { PhotoInput } from "./capture-inputs";
import { CardPhotos } from "./card-photos";
import {
  DraftNotesEditor,
  draftNotesFrom,
  notesPayload,
  type DraftNote,
} from "./draft-notes";
import {
  DuplicatesPanel,
  effectiveResolution,
  type Resolution,
} from "./duplicates-panel";
import {
  Collapsible,
  ExportDetailsFields,
  QualityChips,
  exportDetailsDefaults,
  hasExportDetails,
} from "./export-details";
import { PageHeader } from "./page-header";
import { EventOptions, FormSelect, UserOptions } from "./pickers";
import { usePhoneHint } from "./phone";
import { ProductPicker, productsPayload, type PickedProduct } from "./product-picker";
import { ShowHeader } from "./show-header";
import { TranscriptPanels } from "./transcript";

/** Fallback first message when there is no draft yet (still being read, or reading failed). */
function contentFrom(c: Capture) {
  const x = c.extracted;
  return (
    [x?.requirement_summary, x?.next_steps ? `Next steps: ${x.next_steps}` : null].filter(Boolean).join("\n\n") ||
    c.note ||
    ""
  );
}

/**
 * Form values. The API's `suggestions.confirm_draft` is the source when present: it already has the
 * cleaned phone, the country, export details, owner, follow-up date and the duplicate recommendation.
 * Before n8n has read the capture, the raw extraction (or nothing) is used. Everything stays editable.
 */
function defaultsFrom(c: Capture) {
  const x = c.extracted;
  const d: Partial<CaptureConfirmDraft> = c.suggestions?.confirm_draft ?? {};
  const s = (draft: string | null | undefined, raw?: string | null) => draft ?? raw ?? "";
  const phone = s(d.contact_phone, x?.contact_phone);
  const rawPhones = splitPhones(x?.contact_phone);
  return {
    contact_name: s(d.contact_name, x?.contact_name),
    contact_phone: phone,
    contact_email: s(d.contact_email, x?.contact_email),
    contact_designation: s(d.contact_designation, x?.contact_designation),
    // WhatsApp goes to the main number unless the card names another one.
    contact_whatsapp: s(d.contact_whatsapp, x?.contact_whatsapp) || (splitPhones(phone)[0] ?? phone),
    // The draft already split two numbers; before that, the raw extraction's second number.
    contact_alternate_phone: c.suggestions
      ? s(d.contact_alternate_phone)
      : s(x?.contact_alternate_phone) || (rawPhones[1] ?? ""),
    account_name: s(d.account_name, x?.account_name),
    account_domain: s(d.account_domain, x?.account_domain),
    account_industry: s(d.account_industry, x?.account_industry),
    account_location: s(d.account_location, x?.account_location),
    account_country: s(d.account_country, x?.account_country).toUpperCase(),
    account_website: s(d.account_website, x?.account_website),
    division: s(d.division),
    product_id: "",
    quality_tag: s(d.quality_tag, x?.quality_tag),
    // Blank = the API's default (the rep who captured it).
    owner_id: d.owner_id ?? "",
    next_follow_up_at: toLocalInput(d.next_follow_up_at ?? x?.next_follow_up_at),
    lead_resolution: "new",
    lead_id: "",
    lead_title: s(d.lead_title, x?.lead_title),
    requirement_summary: s(d.requirement_summary, x?.requirement_summary),
    event_id: d.event_id ?? c.event_id ?? "",
    content: d.content ?? contentFrom(c),
    request_research: d.request_research ?? true,
    request_first_touch: d.request_first_touch ?? true,
    ...exportDetailsDefaults(c.suggestions ? d : x),
  };
}

/** Pre-selected products: the draft's order (first = main) with each suggestion's badge and what was said. */
function productsFrom(c: Capture): PickedProduct[] {
  const sug = c.suggestions;
  if (!sug) return [];
  const byId = new Map(sug.products.map((p) => [p.product_id, p]));
  const order = sug.confirm_draft.products?.map((p) => p.product_id) ?? sug.products.map((p) => p.product_id);
  const draft = new Map((sug.confirm_draft.products ?? []).map((p) => [p.product_id, p]));
  return order
    .map((id) => {
      const s = byId.get(id);
      const dp = draft.get(id);
      if (!s) return null;
      return {
        product_id: id,
        name: s.name,
        sku: s.sku,
        quantity: dp?.quantity ?? s.quantity ?? "",
        note: dp?.note ?? s.note ?? "",
        origin: s.matched_on === "text" ? "transcript" : "voice",
        mentions: s.mentions,
      } satisfies PickedProduct;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

const LOW_CONFIDENCE = 0.6;

/** Statuses in which the API lets the files change (anything else is a 409). */
const FILES_EDITABLE: Capture["status"][] = ["draft", "ready_for_review", "failed"];

/**
 * Add, replace or remove the photo of the back of the card. The API then sends the capture back to draft
 * and clears what was read, so the reviewer is warned first and can send it for reading again.
 */
function BackOfCardEditor({ capture }: { capture: Capture }) {
  const { can } = useAuth();
  const confirmDialog = useConfirm();
  const back = useCardBack(capture.id);
  const [picking, setPicking] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  if (!can("captures:write") || !FILES_EDITABLE.includes(capture.status)) return null;

  const hasBack = Boolean(capture.card_back);
  const busy = progress !== null || back.remove.isPending;
  // A draft has nothing read yet; anything else has suggestions that a change clears.
  const wasRead = capture.status !== "draft";
  const warning =
    "Changing a photo sends this capture back to draft and clears the current suggestions. What you've typed in the form stays. Afterwards, tap Send for reading to read the card again.";
  const done = (message: string) =>
    toast.success(wasRead ? `${message} Tap Send for reading to read it again.` : message);

  const upload = async (photo: Blob) => {
    setError(null);
    if (
      wasRead &&
      !(await confirmDialog({
        title: hasBack ? "Replace the back of the card?" : "Add the back of the card?",
        description: warning,
        confirmLabel: hasBack ? "Replace photo" : "Add photo",
      }))
    )
      return;
    setProgress(0);
    try {
      await back.upload.mutateAsync({ photo, onProgress: setProgress });
      setPicking(false);
      done("Back of the card saved.");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setProgress(null);
    }
  };

  const remove = async () => {
    setError(null);
    const ok = await confirmDialog({
      title: "Remove the back of the card?",
      description: wasRead ? warning : "The photo of the back of the card is deleted.",
      confirmLabel: "Remove photo",
      destructive: true,
    });
    if (!ok) return;
    try {
      await back.remove.mutateAsync();
      done("Back of the card removed.");
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="space-y-2">
      {picking ? (
        <div className="space-y-2 rounded-[12px] border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-medium">
              {hasBack ? "New photo of the back of the card" : "Back of the card"}
            </p>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPicking(false)}>
              Cancel
            </Button>
          </div>
          <PhotoInput side="back" compact disabled={busy} onPhoto={(p) => void upload(p)} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              setError(null);
              setPicking(true);
            }}
          >
            {hasBack ? <RotateCcw aria-hidden /> : <Plus aria-hidden />}
            {hasBack ? "Replace the back" : "Add the back of the card"}
          </Button>
          {hasBack && (
            <Button
              variant="danger-tint"
              size="sm"
              disabled={busy}
              loading={back.remove.isPending}
              onClick={() => void remove()}
            >
              <Trash2 aria-hidden />
              Remove the back
            </Button>
          )}
        </div>
      )}
      {progress !== null && (
        <p role="status" className="text-[13px] text-muted">
          Uploading the back of the card — {Math.round(progress * 100)}%
        </p>
      )}
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}

/** The originals, next to the form, so the rep can check the suggestions against them. */
function Originals({ capture }: { capture: Capture }) {
  const gone = capture.status === "discarded";
  return (
    <div className="space-y-3">
      {!gone && <CardPhotos front={capture.card} back={capture.card_back} className="h-64 w-full" />}
      <BackOfCardEditor capture={capture} />
      {capture.voice && !gone && <AudioPlayer src={attachmentSrc(capture.voice.id)} label="Voice note" />}
      {!capture.card && !capture.card_back && !capture.voice && (
        <p className="text-[14px] text-muted">No photo or voice note on this capture.</p>
      )}
      {capture.note && (
        <p className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[14px]">
          <span className="text-muted">Note: </span>
          {capture.note}
        </p>
      )}
      <TranscriptPanels x={capture.extracted} />
      {capture.extraction_error && (
        <InlineAlert tone="warning">
          <span className="font-medium">Couldn&apos;t read everything:</span> {capture.extraction_error}
        </InlineAlert>
      )}
    </div>
  );
}

function ReviewForm({ capture }: { capture: Capture }) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const { me, can } = useAuth();
  const canWrite = can("captures:write");
  const phoneHint = usePhoneHint();
  // Empty lists explain themselves instead of looking broken (both fields are optional).
  const shows = events.useList({ limit: 200 }, { enabled: can("events:read") });
  const catalog = products.useList({ limit: 200 }, { enabled: can("catalog:read") });
  const noShows = shows.isSuccess && shows.data.items.length === 0;
  const noProducts = catalog.isSuccess && catalog.data.items.length === 0;
  const actions = useCaptureActions(capture.id);
  const { banner, setBanner, clear } = useFormBanner();
  const countries = React.useMemo(() => countryOptions(), []);

  const initial = React.useMemo(() => defaultsFrom(capture), [capture]);
  const form = useZodForm(captureConfirm, initial as never);
  const { errors, isDirty } = form.formState;
  const [picked, setPicked] = React.useState<PickedProduct[]>(() => productsFrom(capture));
  const [notes, setNotes] = React.useState<DraftNote[]>(() =>
    draftNotesFrom(capture.suggestions?.confirm_draft.notes),
  );
  const [extrasEdited, setExtrasEdited] = React.useState(false);
  const changeProducts = (p: PickedProduct[]) => {
    setExtrasEdited(true);
    setPicked(p);
  };
  const changeNotes = (n: DraftNote[]) => {
    setExtrasEdited(true);
    setNotes(n);
  };

  const confidence = (capture.extracted?.confidence ?? {}) as Record<string, number>;
  const low = (key: string) => typeof confidence[key] === "number" && confidence[key]! < LOW_CONFIDENCE;
  const lowProps = (key: string) => (low(key) ? { className: "border-warning" } : {});
  const lowHint = (key: string, extra?: React.ReactNode) =>
    low(key) ? (
      <span className="text-warning">
        Not sure about this one — please check it.{extra}
      </span>
    ) : (
      extra
    );

  /* Suggestions arrive while the rep is looking (or typing): fill in only when it won't clobber their edits. */
  const seen = React.useRef(JSON.stringify([capture.extracted, capture.suggestions]));
  const [fresh, setFresh] = React.useState(false);
  const applySuggestions = React.useCallback(() => {
    form.reset(defaultsFrom(capture) as never);
    setPicked(productsFrom(capture));
    setNotes(draftNotesFrom(capture.suggestions?.confirm_draft.notes));
    setExtrasEdited(false);
    setFresh(false);
  }, [capture, form]);
  React.useEffect(() => {
    const now = JSON.stringify([capture.extracted, capture.suggestions]);
    if (now === seen.current) return;
    seen.current = now;
    // A card photo was changed: the API cleared what was read. Nothing new to suggest, so keep the form as it is.
    if (!capture.extracted && capture.status === "draft") return;
    if (!form.formState.isDirty && !extrasEdited) queueMicrotask(applySuggestions);
    else queueMicrotask(() => setFresh(true)); // an edit is in progress: offer the suggestions instead of overwriting
  }, [capture, form, extrasEdited, applySuggestions]);

  /* Duplicate check: the embedded one first; re-checked (debounced) once the reviewer edits who this is. */
  const [name, phoneRaw, email, whatsapp, company] = form.watch([
    "contact_name",
    "contact_phone",
    "contact_email",
    "contact_whatsapp",
    "account_name",
  ]) as [string, string, string, string, string];
  const phones = splitPhones(phoneRaw);
  const mainPhone = (phones[0] ?? phoneRaw ?? "").trim();
  const lastPhone = React.useRef(mainPhone);
  React.useEffect(() => {
    const before = lastPhone.current;
    lastPhone.current = mainPhone;
    if (mainPhone === before) return;
    // WhatsApp still empty or still the old phone number = it was never a different number: keep it in step.
    const wa = ((form.getValues() as { contact_whatsapp?: string }).contact_whatsapp ?? "").trim();
    if (wa === "" || wa === before) form.setValue("contact_whatsapp", mainPhone as never);
  }, [mainPhone, form]);
  const productIds = picked.map((p) => p.product_id);
  const who = {
    name: (name ?? "").trim(),
    phone: (phones[0] ?? phoneRaw ?? "").trim(),
    email: (email ?? "").trim(),
    whatsapp: (whatsapp ?? "").trim(),
    company: (company ?? "").trim(),
    product_id: productIds,
  };
  const baseline = React.useMemo(
    () =>
      JSON.stringify({
        name: initial.contact_name.trim(),
        phone: (splitPhones(initial.contact_phone)[0] ?? initial.contact_phone).trim(),
        email: initial.contact_email.trim(),
        whatsapp: initial.contact_whatsapp.trim(),
        company: initial.account_name.trim(),
        product_id: productsFrom(capture).map((p) => p.product_id),
      }),
    [initial, capture],
  );
  const dWho = useDebounced(JSON.stringify(who), 600);
  const edited = dWho !== baseline;
  const recheck = useCaptureDuplicates(capture.id, JSON.parse(dWho) as Record<string, string | string[]>, canWrite && edited);
  const dup = edited ? (recheck.data ?? capture.duplicates) : capture.duplicates;

  const [choice, setChoice] = React.useState<Resolution | null>(() => {
    const d = capture.suggestions?.confirm_draft;
    return d?.lead_resolution === "attach" && d.lead_id ? { kind: "attach", leadId: d.lead_id } : null;
  });
  const [choiceMissing, setChoiceMissing] = React.useState(false);
  const resolution = effectiveResolution(dup, choice);

  const onConfirm = form.handleSubmit(async (values) => {
    clear();
    if (!resolution) {
      setChoiceMissing(true);
      return;
    }
    const v = values as Record<string, unknown>;
    // Unchanged show = leave it out, so the capture keeps its own (null would mean "not from a show").
    const eventChanged = (form.getValues() as { event_id?: string }).event_id !== initial.event_id;
    const { event_id, product_id: _p, ...rest } = v;
    void _p;
    const body = {
      ...rest,
      ...(eventChanged ? { event_id: event_id ?? null } : {}),
      ...productsPayload(picked),
      ...notesPayload(notes),
      lead_resolution: resolution.kind,
      ...(resolution.kind === "attach" ? { lead_id: resolution.leadId } : { lead_id: undefined }),
    };
    try {
      const r = await actions.confirm.mutateAsync(body);
      if (r.lead.contact_review_status === "needs_review") {
        toast.warning(
          "These details differ from what we already have for this person. Nothing was overwritten — worth a look.",
          { duration: 12000 },
        );
      }
      toast.success(r.lead.is_new_lead ? "Lead created" : "Added to their open lead");
      router.replace(`/leads/${r.redirect_lead_id ?? r.lead.lead_id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Someone else confirmed it first: go to the lead instead of showing a dead end.
        const latest = await api<Capture>(`/captures/${capture.id}`).catch(() => null);
        if (latest?.lead_id) {
          toast.info("This capture was already confirmed.");
          router.replace(`/leads/${latest.lead_id}`);
          return;
        }
      }
      setBanner(applyApiError(form as never, e, { "body.lead_id": "lead_id" }));
    }
  });

  const retry = async () => {
    try {
      await actions.submit.mutateAsync();
      toast.success("Sent to be read again");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "Couldn't send it. Try again.");
    }
  };

  const discard = async () => {
    const ok = await confirmDialog({
      title: "Discard this capture?",
      description: "This deletes the photos and the recording for good. No lead is created.",
      confirmLabel: "Discard capture",
      destructive: true,
    });
    if (!ok) return;
    try {
      await actions.discard.mutateAsync();
      toast.success("Capture discarded");
      router.push("/captures");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : "Couldn't discard it. Try again.");
    }
  };

  const status = capture.status;
  const reading = READING_STATUSES.includes(status);
  const hasFiles = Boolean(capture.card || capture.card_back || capture.voice);
  const canRetry = canWrite && (status === "failed" || status === "ready_for_review" || (status === "draft" && hasFiles));
  const warnings = capture.suggestions?.warnings ?? [];
  const detailsOpen = hasExportDetails(capture.suggestions?.confirm_draft ?? capture.extracted);

  return (
    <form onSubmit={(e) => void onConfirm(e)} noValidate className="space-y-4">
      {banner && <InlineAlert>{banner}</InlineAlert>}

      {reading && (
        <InlineAlert tone="accent" className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            We&apos;re still reading this. You don&apos;t have to wait — fill it in yourself and confirm whenever you
            like. Suggestions will appear on their own.
          </span>
        </InlineAlert>
      )}
      {status === "failed" && (
        <InlineAlert tone="warning">
          We couldn&apos;t read this one. Type the details from the photo and recording and confirm — or tap Retry
          reading.
        </InlineAlert>
      )}
      {status === "ready_for_review" && (
        <InlineAlert tone="accent">
          This form was filled in from the card and the voice note. It can be wrong — check it before you confirm.
        </InlineAlert>
      )}
      {status === "draft" && (
        <InlineAlert tone="accent">
          This capture hasn&apos;t been sent for reading. Fill the details in yourself, or send it to be read first.
        </InlineAlert>
      )}
      {warnings.length > 0 && (
        <InlineAlert tone="warning" className="space-y-1">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            Worth checking
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      {fresh && (
        <InlineAlert tone="warning" className="flex flex-wrap items-center justify-between gap-2">
          <span>New suggestions arrived while you were editing.</span>
          <Button size="sm" variant="secondary" onClick={applySuggestions}>
            Use them (replaces your edits)
          </Button>
        </InlineAlert>
      )}
      {!canWrite && <InlineAlert>You can look at this capture but not change it.</InlineAlert>}

      {/* Duplicate check: do we already know them, and do they have an open enquiry? */}
      <DuplicatesPanel
        dup={dup}
        resolution={resolution}
        disabled={!canWrite}
        checking={recheck.isFetching}
        choiceMissing={choiceMissing}
        onChoose={(r) => {
          setChoice(r);
          setChoiceMissing(false);
        }}
      />

      <fieldset disabled={!canWrite} className="space-y-4">
        <Card>
          <CardBody className="space-y-4">
            <FieldGroup title="Contact">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Name"
                  required
                  error={errors.contact_name?.message as string | undefined}
                  hint={lowHint("contact_name")}
                >
                  <Input maxLength={300} {...lowProps("contact_name")} {...form.register("contact_name")} />
                </Field>
                <Field
                  label="Job title"
                  error={errors.contact_designation?.message as string | undefined}
                  hint={lowHint("contact_designation")}
                >
                  <Input maxLength={300} {...lowProps("contact_designation")} {...form.register("contact_designation")} />
                </Field>
                <Field
                  label="Phone"
                  error={errors.contact_phone?.message as string | undefined}
                  hint={lowHint(
                    "contact_phone",
                    <>
                      {phoneHint}
                      {phones.length > 1 && (
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-muted">
                          More than one number — keep which?{" "}
                          {phones.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                form.setValue("contact_phone", p as never, { shouldDirty: true, shouldValidate: true });
                                const other = phones.find((q) => q !== p);
                                const alternate = (form.getValues() as { contact_alternate_phone?: string }).contact_alternate_phone;
                                if (other && !alternate?.trim())
                                  form.setValue("contact_alternate_phone", other as never, { shouldDirty: true });
                              }}
                              className="rounded-full bg-accent-soft px-2.5 py-1 text-[13px] font-medium text-accent"
                            >
                              {p}
                            </button>
                          ))}
                        </span>
                      )}
                    </>,
                  )}
                >
                  <Input type="tel" inputMode="tel" maxLength={50} {...lowProps("contact_phone")} {...form.register("contact_phone")} />
                </Field>
                <Field
                  label="Email"
                  error={errors.contact_email?.message as string | undefined}
                  hint={lowHint("contact_email")}
                >
                  <Input
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    maxLength={320}
                    {...lowProps("contact_email")}
                    {...form.register("contact_email")}
                  />
                </Field>
                <Field
                  label="WhatsApp"
                  hint="The number to message on WhatsApp: the phone number, unless the card shows a different WhatsApp number."
                  error={errors.contact_whatsapp?.message as string | undefined}
                >
                  <Input type="tel" inputMode="tel" maxLength={50} {...form.register("contact_whatsapp")} />
                </Field>
                <Field
                  label="Alternate number"
                  hint="Only when the card has a second number."
                  error={errors.contact_alternate_phone?.message as string | undefined}
                >
                  <Input type="tel" inputMode="tel" maxLength={50} {...form.register("contact_alternate_phone")} />
                </Field>
              </div>
              <p className="text-[13px] text-muted">
                A phone or an email is needed, so we can recognise this person next time.
              </p>
            </FieldGroup>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <FieldGroup title="Company">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Company name"
                  required
                  className="sm:col-span-2"
                  error={errors.account_name?.message as string | undefined}
                  hint={lowHint("account_name")}
                >
                  <Input maxLength={300} {...lowProps("account_name")} {...form.register("account_name")} />
                </Field>
                <FormSelect
                  control={form.control as never}
                  name="account_country"
                  label="Country"
                  placeholder="Not known"
                  hint={lowHint("account_country")}
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </FormSelect>
                <Field
                  label="Website"
                  error={errors.account_website?.message as string | undefined}
                  hint={lowHint("account_website")}
                >
                  <Input
                    autoCapitalize="none"
                    inputMode="url"
                    maxLength={500}
                    placeholder="example.com"
                    {...form.register("account_website")}
                  />
                </Field>
                <Field
                  label="Location"
                  error={errors.account_location?.message as string | undefined}
                  hint={lowHint("account_location")}
                >
                  <Input maxLength={300} {...lowProps("account_location")} {...form.register("account_location")} />
                </Field>
                <Field
                  label="Industry"
                  error={errors.account_industry?.message as string | undefined}
                  hint={lowHint("account_industry")}
                >
                  <Input maxLength={300} {...lowProps("account_industry")} {...form.register("account_industry")} />
                </Field>
              </div>
            </FieldGroup>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <FieldGroup title="Enquiry">
              <Field
                label="Lead title"
                hint="A few words, e.g. “Organic tulsi tea, private label”."
                error={errors.lead_title?.message as string | undefined}
              >
                <Input maxLength={200} {...form.register("lead_title")} />
              </Field>
              <Field
                label="What they need"
                error={errors.requirement_summary?.message as string | undefined}
              >
                <Textarea rows={2} maxLength={4000} {...form.register("requirement_summary")} />
              </Field>
              {can("catalog:read") && (
                <ProductPicker
                  value={picked}
                  onChange={changeProducts}
                  disabled={!canWrite}
                  hint={
                    noProducts ? (
                      <>
                        No products in your catalogue yet — this is optional.
                        {can("catalog:write") && (
                          <>
                            {" "}
                            <Link href="/catalog" className="font-medium text-accent hover:underline">
                              Add products
                            </Link>
                          </>
                        )}
                      </>
                    ) : capture.extracted?.product_hint && picked.length === 0 ? (
                      <>They mentioned: {capture.extracted.product_hint}</>
                    ) : undefined
                  }
                />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormSelect
                  control={form.control as never}
                  name="event_id"
                  label="Exhibition"
                  placeholder="Not from a show"
                  hint={
                    noShows ? (
                      <>
                        No exhibitions yet. Leads without one are saved as <em>In person</em>.
                        {can("events:write") && (
                          <>
                            {" "}
                            <Link href="/events" className="font-medium text-accent hover:underline">
                              Add an exhibition
                            </Link>
                          </>
                        )}
                      </>
                    ) : (
                      "Pick “Not from a show” for office visits, walk-ins and meetings — saved as In person."
                    )
                  }
                >
                  <EventOptions />
                </FormSelect>
                <Field label="Division" error={errors.division?.message as string | undefined}>
                  <Input maxLength={200} {...form.register("division")} />
                </Field>
              </div>
            </FieldGroup>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Collapsible
              title="Export details"
              description="Buyer type, volume, packaging, samples, price and follow-up."
              defaultOpen={detailsOpen}
            >
              <div className="space-y-4">
                <ExportDetailsFields form={form as never} />
                <QualityChips form={form as never} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {can("users:read") ? (
                    <FormSelect
                      control={form.control as never}
                      name="owner_id"
                      label="Assigned seller"
                      hint="Defaults to whoever captured it."
                    >
                      <option value="">Whoever captured it</option>
                      <option value={UNASSIGNED}>Unassigned</option>
                      <UserOptions />
                    </FormSelect>
                  ) : (
                    <div className="space-y-1.5">
                      <span className="block text-[13px] font-medium">Assigned seller</span>
                      <p className="flex h-11 items-center text-[15px] sm:h-9">
                        {capture.created_by_user_id === me.id || !capture.created_by ? "You" : capture.created_by.name}
                      </p>
                    </div>
                  )}
                  <Field
                    label="Next follow-up"
                    hint="Set from the earliest promise, if any."
                    error={errors.next_follow_up_at?.message as string | undefined}
                  >
                    <Input type="datetime-local" {...form.register("next_follow_up_at")} />
                  </Field>
                </div>
              </div>
            </Collapsible>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <FieldGroup
              title="Conversation notes"
              description="Saved on the lead. Promises get a checkbox and a due date."
            >
              <DraftNotesEditor value={notes} onChange={changeNotes} disabled={!canWrite} />
            </FieldGroup>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <Field
              label="First message"
              hint="Saved as the first message on the lead, with the photo and recording attached."
              error={errors.content?.message as string | undefined}
            >
              <Textarea rows={4} maxLength={20000} {...form.register("content")} />
            </Field>
            {resolution?.kind !== "attach" && (
              <label className="flex items-start gap-3 text-[14px]">
                <Checkbox className="mt-0.5" {...form.register("request_first_touch")} />
                <span>
                  <span className="font-medium">Write a personal message to send them</span>
                  <span className="block text-[13px] text-muted">
                    AI writes it from the conversation, your notes and the card. You check and send it from the lead page.
                  </span>
                </span>
              </label>
            )}
            <label className="flex items-start gap-3 text-[14px]">
              <Checkbox className="mt-0.5" {...form.register("request_research")} />
              <span>
                <span className="font-medium">Research this lead after saving</span>
                <span className="block text-[13px] text-muted">
                  Looks up the company in public sources and suggests a score. Usually takes a few minutes.
                </span>
              </span>
            </label>
          </CardBody>
        </Card>
      </fieldset>

      {canWrite && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {canRetry && (
              <Button variant="secondary" loading={actions.submit.isPending} onClick={() => void retry()}>
                <RefreshCw aria-hidden />
                {status === "draft" ? "Send for reading" : "Retry reading"}
              </Button>
            )}
            <Button variant="danger-tint" onClick={() => void discard()} loading={actions.discard.isPending}>
              <Trash2 aria-hidden />
              Discard
            </Button>
          </div>
          <Button type="submit" size="lg" className="sm:min-w-44" loading={actions.confirm.isPending}>
            <CheckCircle2 aria-hidden />
            Confirm lead
          </Button>
        </div>
      )}
      {(isDirty || extrasEdited) && canWrite && (
        <p className="text-right text-[12px] text-muted">Nothing is saved until you confirm.</p>
      )}
    </form>
  );
}

export function CaptureReview({ id }: { id: string }) {
  const q = useCapture(id);

  if (q.isPending) return <Skeleton className="h-96 w-full rounded-[14px]" />;
  if (q.isError) {
    return (
      <>
        <PageHeader title="Capture" back={{ href: "/captures", label: "Captures" }} />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </>
    );
  }
  const c = q.data;
  const open = c.status !== "confirmed" && c.status !== "discarded";
  const draft = c.suggestions?.confirm_draft;

  return (
    <>
      <PageHeader
        back={{ href: "/captures", label: "Captures" }}
        title={draft?.contact_name ?? c.extracted?.contact_name ?? draft?.account_name ?? c.extracted?.account_name ?? "Capture"}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CaptureBadge status={c.status} />
            <span>
              {c.created_by?.name ?? "A teammate"} · {formatRelative(c.created_at)}
            </span>
          </span>
        }
      />
      <ShowHeader event={c.event} className="mb-4" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Originals capture={c} />
        </aside>
        <div className="min-w-0">
          {open ? (
            <ReviewForm capture={c} />
          ) : c.status === "confirmed" ? (
            <Card>
              <CardBody className="space-y-3 text-center">
                <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
                <h2 className="text-[20px] font-semibold">Lead created</h2>
                <p className="text-[14px] text-muted">Confirmed {formatDateTime(c.confirmed_at)}.</p>
                {c.lead_id && (
                  <Button asChild>
                    <Link href={`/leads/${c.lead_id}`}>Open the lead</Link>
                  </Button>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="space-y-2 text-center">
                <AlertTriangle className="mx-auto size-10 text-muted" aria-hidden />
                <h2 className="text-[20px] font-semibold">{CAPTURE_LABEL.discarded}</h2>
                <p className="text-[14px] text-muted">The photos and recording were deleted and no lead was created.</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
