"use client";

import * as React from "react";
import { PackageCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { describeError } from "@/lib/api/errors";
import { useSampleMutations, useSamples } from "@/lib/api/hooks";
import type { SampleRequest, SampleRequestStatus } from "@/lib/api/types";
import { SAMPLE_LABEL, SAMPLE_STATUSES } from "@/lib/enums";
import { formatDate } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { sampleCreate } from "@/lib/schemas";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { useAuth } from "./auth";
import { ProductName } from "./entities";
import { FormSelect, ProductOptions } from "./pickers";

const TONE: Record<SampleRequestStatus, Tone> = {
  requested: "neutral",
  shipped: "accent",
  delivered: "success",
  cancelled: "danger",
};

function NewSampleDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { can } = useAuth();
  const { create } = useSampleMutations(leadId);
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(sampleCreate, { product_id: "", tracking_ref: "" });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      await create.mutateAsync(values as Record<string, unknown>);
      toast.success("Sample request added");
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Request a sample"
        description="Track a sample from request through delivery."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          {can("catalog:read") && (
            <FormSelect
              control={form.control as never}
              name="product_id"
              label="Product"
              placeholder="No specific product"
            >
              <ProductOptions />
            </FormSelect>
          )}
          <Field
            label="Tracking reference"
            hint="Courier or AWB number, if you have it."
            error={errors.tracking_ref?.message as string | undefined}
          >
            <Input maxLength={300} {...form.register("tracking_ref")} />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Add sample request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SampleRow({ s, leadId }: { s: SampleRequest; leadId: string }) {
  const { can } = useAuth();
  const { update } = useSampleMutations(leadId);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium">
          <ProductName id={s.product_id} />
        </p>
        <p className="text-[13px] text-muted">
          Requested {formatDate(s.created_at)}
          {s.tracking_ref && <> · {s.tracking_ref}</>}
        </p>
      </div>
      {can("samples:write") ? (
        // The API doesn't enforce an order for sample status, so this is a free picker.
        <div className="w-40">
          <Select
            aria-label={`Status for sample requested ${formatDate(s.created_at)}`}
            value={s.status}
            disabled={update.isPending}
            onChange={(e) =>
              update.mutate(
                { id: s.id, body: { status: e.target.value } },
                { onError: (err) => toast.error(describeError(err)) },
              )
            }
          >
            {SAMPLE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {SAMPLE_LABEL[st]}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <Badge tone={TONE[s.status]} dot>
          {SAMPLE_LABEL[s.status]}
        </Badge>
      )}
    </li>
  );
}

export function SamplesPanel({ leadId }: { leadId: string }) {
  const { can } = useAuth();
  const q = useSamples(leadId, can("samples:read"));
  const [creating, setCreating] = React.useState(false);

  if (!can("samples:read"))
    return (
      <EmptyState title="Sample requests aren't available for your role" />
    );
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <p className="text-[14px] text-muted">
          {q.data
            ? `${q.data.length} sample request${q.data.length === 1 ? "" : "s"}`
            : " "}
        </p>
        {can("samples:write") && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Request sample
          </Button>
        )}
      </div>
      {q.isPending ? (
        <RowsSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No samples requested"
          description="If this buyer wants to see the product first, request a sample and track it here."
        />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((s) => (
            <SampleRow key={s.id} s={s} leadId={leadId} />
          ))}
        </ul>
      )}
      {creating && (
        <NewSampleDialog leadId={leadId} open onOpenChange={setCreating} />
      )}
    </div>
  );
}
