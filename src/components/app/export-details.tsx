"use client";

import * as React from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { products as productsApi, useUpdateLead } from "@/lib/api/hooks";
import type { Lead, LeadQualityTag } from "@/lib/api/types";
import {
  BUYER_TYPES,
  BUYER_TYPE_LABEL,
  CONTACT_CHANNELS,
  CONTACT_CHANNEL_LABEL,
  INCOTERMS,
  QUALITY_LABEL,
  QUALITY_TAGS,
  REQUIREMENT_TYPES,
  REQUIREMENT_TYPE_LABEL,
  buyerTypeLabel,
  contactChannelLabel,
  requirementTypeLabel,
} from "@/lib/enums";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { EXPORT_DETAIL_KEYS, leadUpdate } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useAuth } from "./auth";
import { FormSelect } from "./pickers";

type Source = Partial<Record<(typeof EXPORT_DETAIL_KEYS)[number], unknown>>;

/** API values → form strings ("" = not set; samples as yes/no). */
export function exportDetailsDefaults(src: Source | null | undefined) {
  const out: Record<string, string> = {};
  for (const k of EXPORT_DETAIL_KEYS) {
    const v = src?.[k];
    out[k] =
      k === "samples_requested"
        ? v === true
          ? "yes"
          : v === false
            ? "no"
            : ""
        : typeof v === "string"
          ? v
          : "";
  }
  return out;
}

export function hasExportDetails(src: Source | null | undefined): boolean {
  return EXPORT_DETAIL_KEYS.some((k) => {
    const v = src?.[k];
    return v !== null && v !== undefined && v !== "";
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any -- shared across forms with different shapes */
type AnyForm = UseFormReturn<any, unknown, any>;

/** Hot / Warm / Cold chips with a way back to "not rated". */
export function QualityChips({
  form,
  name = "quality_tag",
  label = "Initial lead quality",
}: {
  form: AnyForm;
  name?: string;
  label?: string;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <div className="space-y-1.5">
          <span className="flex items-center justify-between text-[13px] font-medium">
            {label}
            {field.value ? (
              <button
                type="button"
                className="text-[13px] font-normal text-accent hover:underline"
                onClick={() => field.onChange("")}
              >
                Clear
              </button>
            ) : (
              <span className="text-[13px] font-normal text-muted">Not rated</span>
            )}
          </span>
          <Segmented<LeadQualityTag>
            label={label}
            value={(field.value as LeadQualityTag) || null}
            onValueChange={field.onChange}
            options={QUALITY_TAGS.map((t) => ({ value: t, label: QUALITY_LABEL[t] }))}
          />
        </div>
      )}
    />
  );
}

/** The "Export details" fields (hand-off §4.3 D), for any form whose schema spreads `exportDetails`. */
export function ExportDetailsFields({ form }: { form: AnyForm }) {
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;
  const samples = form.watch("samples_requested") as string;
  const err = (k: string) => errors[k]?.message;
  const listId = React.useId();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormSelect control={form.control as never} name="buyer_type" label="Buyer type" placeholder="Not known">
        {BUYER_TYPES.map((t) => (
          <option key={t} value={t}>
            {BUYER_TYPE_LABEL[t]}
          </option>
        ))}
      </FormSelect>
      <FormSelect
        control={form.control as never}
        name="requirement_type"
        label="Requirement type"
        placeholder="Not known"
      >
        {REQUIREMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {REQUIREMENT_TYPE_LABEL[t]}
          </option>
        ))}
      </FormSelect>
      <Field label="Approximate volume" error={err("approx_volume")}>
        <Input maxLength={300} placeholder="e.g. 2 x 20ft FCL per month" {...form.register("approx_volume")} />
      </Field>
      <Field label="Destination market" error={err("destination_market")}>
        <Input maxLength={300} placeholder="e.g. Sweden, Norway" {...form.register("destination_market")} />
      </Field>
      <Field label="Packaging" className="sm:col-span-2" error={err("packaging_requirement")}>
        <Textarea rows={2} maxLength={1000} {...form.register("packaging_requirement")} />
      </Field>
      <FormSelect control={form.control as never} name="samples_requested" label="Samples requested" placeholder="Don't know">
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </FormSelect>
      {samples === "yes" ? (
        <Field label="Sample details" error={err("sample_requirement")}>
          <Input maxLength={1000} placeholder="e.g. 250 g each, by courier" {...form.register("sample_requirement")} />
        </Field>
      ) : (
        <div className="hidden sm:block" />
      )}
      <Field label="Expected timeline" error={err("expected_timeline")}>
        <Input maxLength={300} placeholder="e.g. first order in Q1" {...form.register("expected_timeline")} />
      </Field>
      <Field label="Target price" error={err("target_price")}>
        <Input maxLength={300} placeholder="e.g. USD 4.20/kg CIF Hamburg" {...form.register("target_price")} />
      </Field>
      <Field label="Incoterm" hint="Pick one or type another." error={err("incoterm")}>
        <Input
          maxLength={20}
          list={listId}
          autoCapitalize="characters"
          placeholder="e.g. CIF"
          {...form.register("incoterm")}
        />
      </Field>
      <datalist id={listId}>
        {INCOTERMS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <FormSelect
        control={form.control as never}
        name="preferred_contact_channel"
        label="Preferred contact channel"
        placeholder="No preference"
      >
        {CONTACT_CHANNELS.map((c) => (
          <option key={c} value={c}>
            {CONTACT_CHANNEL_LABEL[c]}
          </option>
        ))}
      </FormSelect>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Collapsible section wrapper: open by default when any of its fields is already set. */
export function Collapsible({
  title,
  description,
  defaultOpen,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</span>
          {description && <span className="block text-[13px] text-muted">{description}</span>}
        </span>
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/* ── Lead page: read view + inline edit ───────────────────────────────── */
export function ExportDetailsCard({
  lead,
  products,
  canWrite,
}: {
  lead: Lead;
  /** The lead's products: each one's MOQ is shown as a reminder (MOQ belongs to the product). */
  products: { product_id: string; name: string }[];
  canWrite: boolean;
}) {
  const { can } = useAuth();
  const [editing, setEditing] = React.useState(false);
  const catalogue = productsApi.useList({ limit: 200 }, { enabled: can("catalog:read") });
  const moqs = products.map((p) => ({
    name: p.name,
    moq: catalogue.data?.items.find((c) => c.id === p.product_id)?.moq,
  }));
  const rows: [string, React.ReactNode][] = [
    ["Buyer type", lead.buyer_type ? buyerTypeLabel(lead.buyer_type) : null],
    ["Requirement", lead.requirement_type ? requirementTypeLabel(lead.requirement_type) : null],
    ["Volume", lead.approx_volume],
    ["Packaging", lead.packaging_requirement],
    ["Destination", lead.destination_market],
    [
      "Samples",
      lead.samples_requested === true
        ? `Yes${lead.sample_requirement ? ` — ${lead.sample_requirement}` : ""}`
        : lead.samples_requested === false
          ? "No"
          : null,
    ],
    ["Timeline", lead.expected_timeline],
    ["Target price", lead.target_price],
    ["Incoterm", lead.incoterm],
    ["Contact by", lead.preferred_contact_channel ? contactChannelLabel(lead.preferred_contact_channel) : null],
  ];
  const withMoq = moqs.filter((m) => m.moq);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Export details</CardTitle>
        {canWrite && (
          <Button variant="ghost" size="sm" aria-label="Edit export details" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardBody className="pt-2">
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
              <dt className="shrink-0 text-muted">{k}</dt>
              <dd className="min-w-0 break-words text-right">{v || <span className="text-muted">—</span>}</dd>
            </div>
          ))}
          {withMoq.map((m) => (
            <div key={m.name} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
              <dt className="shrink-0 text-muted">MOQ · {m.name}</dt>
              <dd className="min-w-0 text-right">{m.moq}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
      {editing && <ExportDetailsDialog lead={lead} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function ExportDetailsDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const update = useUpdateLead(lead.id, { handled: true, success: "Export details saved" });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(leadUpdate, exportDetailsDefaults(lead) as never);
  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    // Send only what changed: blanks become null, so untouched fields stay as they are.
    const dirty = form.formState.dirtyFields as Record<string, boolean>;
    const body = Object.fromEntries(
      Object.entries(values as Record<string, unknown>).filter(([k]) => dirty[k]),
    );
    if (Object.keys(body).length === 0) return onClose();
    try {
      await update.mutateAsync(body);
      onClose();
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Export details" className="sm:max-w-2xl">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <ExportDetailsFields form={form as never} />
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Save details
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
