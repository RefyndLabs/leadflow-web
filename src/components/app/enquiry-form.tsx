"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Controller } from "react-hook-form";
import { useDebounced } from "@/lib/use-debounced";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useIngest, useLeadDuplicates } from "@/lib/api/hooks";
import type { IngestResult } from "@/lib/api/types";
import { LEAD_SOURCES, TOUCHPOINT_CHANNELS, sourceLabel, channelLabel } from "@/lib/enums";
import { countryOptions } from "@/lib/countries";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { leadIngest } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/feedback";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useAuth } from "./auth";
import { DraftNotesEditor, notesPayload, type DraftNote } from "./draft-notes";
import { DuplicatesPanel, effectiveResolution, type Resolution } from "./duplicates-panel";
import { Collapsible, ExportDetailsFields, QualityChips, exportDetailsDefaults } from "./export-details";
import { EventOptions, FormSelect, UserOptions } from "./pickers";
import { usePhoneHint } from "./phone";
import { ProductPicker, productsPayload, type PickedProduct } from "./product-picker";

export interface EnquiryDefaults {
  source?: string;
  event_id?: string;
  channel?: string;
  content?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_designation?: string;
  account_name?: string;
}

/** The duplicate check as you type: who we already know, and whether this belongs on an open enquiry. */
function useDuplicateCheck(v: {
  name: string;
  phone: string;
  email: string;
  whatsapp: string;
  company: string;
  productIds: string[];
}) {
  const d = useDebounced(JSON.stringify(v), 600);
  const x = JSON.parse(d) as typeof v;
  const phone = x.phone.trim().replace(/\D/g, "").length >= 6 ? x.phone.trim() : undefined;
  const whatsapp = x.whatsapp.trim().replace(/\D/g, "").length >= 6 ? x.whatsapp.trim() : undefined;
  const email = /^\S+@\S+\.\S+$/.test(x.email.trim()) ? x.email.trim() : undefined;
  const company = x.company.trim().length >= 3 ? x.company.trim() : undefined;
  const name = x.name.trim().length >= 2 ? x.name.trim() : undefined;
  return useLeadDuplicates(
    { name, phone, email, whatsapp, company, product_id: x.productIds },
    Boolean(phone || email || whatsapp || company),
  );
}

function Result({
  result,
  onAnother,
}: {
  result: IngestResult;
  onAnother: () => void;
}) {
  const reply = !result.is_new_lead;
  return (
    <Card>
      <CardBody className="space-y-4 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </div>
        <div>
          <h2 className="text-[20px] font-semibold">
            {reply
              ? "Logged as a reply on an existing lead"
              : "New lead created"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-muted">
            {reply
              ? "We matched an existing contact, so this went onto their current lead instead of creating a duplicate."
              : "No matching contact was found, so a fresh lead was started."}
          </p>
        </div>
        <ul className="mx-auto flex max-w-md flex-col gap-1 text-left text-[14px]">
          <li className="flex justify-between rounded-lg bg-surface-2 px-3 py-2">
            <span className="text-muted">Contact</span>
            <span>
              {result.is_new_contact ? "New contact" : "Existing contact"}
            </span>
          </li>
          <li className="flex justify-between rounded-lg bg-surface-2 px-3 py-2">
            <span className="text-muted">Company</span>
            <span>
              {result.is_new_account ? "New company" : "Existing company"}
            </span>
          </li>
        </ul>
        {result.account_review_status === "needs_review" && (
          <InlineAlert tone="warning" className="mx-auto max-w-md text-left">
            The company name is close to an existing one, so it was flagged for
            review instead of merged.{" "}
            <Link
              href={`/accounts/${result.account_id}`}
              className="font-medium underline"
            >
              Review company
            </Link>
          </InlineAlert>
        )}
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link href={`/leads/${result.lead_id}`}>Open lead</Link>
          </Button>
          <Button variant="secondary" onClick={onAnother}>
            Log another enquiry
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function EnquiryForm({
  defaults,
  heading,
  submitLabel = "Log enquiry",
}: {
  defaults?: EnquiryDefaults;
  heading?: React.ReactNode;
  submitLabel?: string;
}) {
  const { can } = useAuth();
  const phoneHint = usePhoneHint();
  const form = useZodForm(leadIngest, {
    contact_name: defaults?.contact_name ?? "",
    contact_phone: defaults?.contact_phone ?? "",
    contact_email: defaults?.contact_email ?? "",
    contact_designation: defaults?.contact_designation ?? "",
    contact_whatsapp: "",
    account_name: defaults?.account_name ?? "",
    account_domain: "",
    account_industry: "",
    account_location: "",
    account_country: "",
    account_website: "",
    source: defaults?.source ?? "call",
    division: "",
    event_id: defaults?.event_id ?? "",
    product_id: "",
    quality_tag: "",
    owner_id: "",
    next_follow_up_at: "",
    lead_title: "",
    requirement_summary: "",
    ...exportDetailsDefaults(null),
    touchpoint: {
      direction: "inbound",
      channel: defaults?.channel ?? "call",
      content: defaults?.content ?? "",
      raw_source_ref: "",
    },
  } as never);
  const { banner, setBanner, clear } = useFormBanner();
  const ingest = useIngest({ handled: true });
  const [result, setResult] = React.useState<IngestResult | null>(null);
  const idem = useIdempotencyKey();

  // Any edit makes it a *different* submission, so it gets a fresh idempotency key; an unchanged retry reuses the old one.
  React.useEffect(() => {
    const sub = form.watch(() => idem.reset());
    return () => sub.unsubscribe();
  }, [form, idem]);

  // Capture flow feeds these in after the form has mounted.
  React.useEffect(() => {
    if (defaults?.event_id !== undefined)
      form.setValue("event_id" as never, defaults.event_id as never);
  }, [defaults?.event_id, form]);

  const [picked, setPicked] = React.useState<PickedProduct[]>([]);
  const [notes, setNotes] = React.useState<DraftNote[]>([]);
  const [choice, setChoice] = React.useState<Resolution | null>(null);
  const [choiceMissing, setChoiceMissing] = React.useState(false);
  const countries = React.useMemo(() => countryOptions(), []);
  // Products and notes live outside the form, so editing them also makes this a new submission.
  React.useEffect(() => idem.reset(), [picked, notes, choice, idem]);

  const [name, phone, email, whatsapp, company] = form.watch([
    "contact_name",
    "contact_phone",
    "contact_email",
    "contact_whatsapp",
    "account_name",
  ]) as [string, string, string, string, string];
  const dup = useDuplicateCheck({
    name: name ?? "",
    phone: phone ?? "",
    email: email ?? "",
    whatsapp: whatsapp ?? "",
    company: company ?? "",
    productIds: picked.map((p) => p.product_id),
  });
  const resolution = effectiveResolution(dup.data, choice);
  const { errors } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    clear();
    if (!resolution) {
      setChoiceMissing(true);
      return;
    }
    const tp = values.touchpoint;
    const hasMessage = Boolean(tp?.content);
    const { touchpoint: _omit, product_id: _p, ...rest } = values as Record<string, unknown> & {
      touchpoint?: unknown;
    };
    void _omit;
    void _p;
    // No known contact: let the API decide ("auto"), exactly as before.
    const known = Boolean(dup.data?.contact);
    const body = {
      ...rest,
      ...productsPayload(picked),
      ...notesPayload(notes),
      ...(known
        ? {
            lead_resolution: resolution.kind,
            ...(resolution.kind === "attach" ? { lead_id: resolution.leadId } : {}),
          }
        : {}),
      ...(hasMessage && tp ? { touchpoint: tp } : {}),
    };
    try {
      setResult(await ingest.mutateAsync({ body, key: idem.get() }));
    } catch (e) {
      setBanner(
        applyApiError(form as never, e, {
          "touchpoint.content": "touchpoint.content",
        }),
      );
    }
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => void submit(e);

  if (result) {
    return (
      <Result
        result={result}
        onAnother={() => {
          setResult(null);
          idem.reset();
          form.reset();
          setPicked([]);
          setNotes([]);
          setChoice(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {heading}
      {banner && <InlineAlert>{banner}</InlineAlert>}
      <DuplicatesPanel
        dup={dup.data}
        resolution={resolution}
        checking={dup.isFetching}
        choiceMissing={choiceMissing}
        onChoose={(r) => {
          setChoice(r);
          setChoiceMissing(false);
        }}
      />

      <Card>
        <CardBody className="space-y-4">
          <FieldGroup title="Contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                required
                error={errors.contact_name?.message as string | undefined}
              >
                <Input
                  autoComplete="off"
                  maxLength={300}
                  {...form.register("contact_name")}
                />
              </Field>
              <Field
                label="Phone"
                error={errors.contact_phone?.message as string | undefined}
                hint={phoneHint}
              >
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={50}
                  {...form.register("contact_phone")}
                />
              </Field>
              <Field
                label="Email"
                error={errors.contact_email?.message as string | undefined}
              >
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  maxLength={320}
                  {...form.register("contact_email")}
                />
              </Field>
              <Field
                label="Job title"
                error={
                  errors.contact_designation?.message as string | undefined
                }
              >
                <Input
                  autoComplete="off"
                  maxLength={300}
                  {...form.register("contact_designation")}
                />
              </Field>
              <Field
                label="WhatsApp"
                hint="Only if it's different from the phone number."
                error={errors.contact_whatsapp?.message as string | undefined}
              >
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={50}
                  {...form.register("contact_whatsapp")}
                />
              </Field>
            </div>
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
              >
                <Input
                  autoComplete="off"
                  maxLength={300}
                  {...form.register("account_name")}
                />
              </Field>
              <FormSelect
                control={form.control as never}
                name="account_country"
                label="Country"
                placeholder="Not known"
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
                label="Industry"
                error={errors.account_industry?.message as string | undefined}
              >
                <Input maxLength={300} {...form.register("account_industry")} />
              </Field>
              <Field
                label="Location"
                error={errors.account_location?.message as string | undefined}
              >
                <Input
                  maxLength={300}
                  placeholder="City, country"
                  {...form.register("account_location")}
                />
              </Field>
            </div>
          </FieldGroup>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <FieldGroup title="Enquiry">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormSelect
                control={form.control as never}
                name="source"
                label="Where did it come from?"
                required
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {sourceLabel(s)}
                  </option>
                ))}
              </FormSelect>
              <Field
                label="Lead title"
                hint="A few words, e.g. “Cotton yarn 30s combed”."
                error={errors.lead_title?.message as string | undefined}
              >
                <Input maxLength={200} {...form.register("lead_title")} />
              </Field>
              <Field
                label="Division"
                error={errors.division?.message as string | undefined}
              >
                <Input maxLength={200} {...form.register("division")} />
              </Field>
              <Field
                label="What they need"
                className="sm:col-span-2"
                error={
                  errors.requirement_summary?.message as string | undefined
                }
              >
                <Textarea
                  rows={2}
                  maxLength={4000}
                  {...form.register("requirement_summary")}
                />
              </Field>
              {can("events:read") && (
                <FormSelect
                  control={form.control as never}
                  name="event_id"
                  label="Exhibition"
                  placeholder="Not from an exhibition"
                >
                  <EventOptions />
                </FormSelect>
              )}
            </div>
            {can("catalog:read") && (
              <ProductPicker value={picked} onChange={setPicked} />
            )}
          </FieldGroup>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <Collapsible
            title="Export details"
            description="Optional: buyer type, volume, packaging, samples, price, owner and follow-up."
          >
            <div className="space-y-4">
              <ExportDetailsFields form={form as never} />
              <QualityChips form={form as never} />
              <div className="grid gap-4 sm:grid-cols-2">
                {can("users:read") && (
                  <FormSelect
                    control={form.control as never}
                    name="owner_id"
                    label="Assigned seller"
                    placeholder="Assign automatically"
                  >
                    <UserOptions />
                  </FormSelect>
                )}
                <Field
                  label="Next follow-up"
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
        <CardBody>
          <Collapsible
            title="Notes and promises"
            description="Optional. Saved on the lead; promises get a due date."
          >
            <DraftNotesEditor value={notes} onChange={setNotes} />
          </Collapsible>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <FieldGroup
            title="Their message"
            description="Optional. Paste what they wrote or noted from the call."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name={"touchpoint.direction" as never}
                render={({ field }) => (
                  <div className="space-y-1.5">
                    <span className="block text-[13px] font-medium">
                      Direction
                    </span>
                    <Segmented
                      label="Direction"
                      value={field.value as "inbound" | "outbound"}
                      onValueChange={field.onChange}
                      options={[
                        {
                          value: "inbound",
                          label: "They contacted us",
                          icon: (
                            <ArrowDownLeft className="size-4" aria-hidden />
                          ),
                        },
                        {
                          value: "outbound",
                          label: "We contacted them",
                          icon: <ArrowUpRight className="size-4" aria-hidden />,
                        },
                      ]}
                    />
                  </div>
                )}
              />
              <Field label="Channel">
                <Select {...form.register("touchpoint.channel" as never)}>
                  {TOUCHPOINT_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {channelLabel(c)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Message"
              error={
                (
                  errors.touchpoint as
                    { content?: { message?: string } } | undefined
                )?.content?.message
              }
            >
              <Textarea
                rows={4}
                maxLength={20000}
                {...form.register("touchpoint.content" as never)}
              />
            </Field>
          </FieldGroup>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" size="lg" loading={ingest.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
