"use client";

import * as React from "react";
import { Check, ExternalLink, FileText, Pencil, Plus, X } from "lucide-react";
import { useQuotationMutations, useQuotations } from "@/lib/api/hooks";
import type { ApprovalStatus, Quotation } from "@/lib/api/types";
import {
  APPROVAL_LABEL,
  QUOTATION_STATUSES,
  QUOTATION_STATUS_LABEL,
} from "@/lib/enums";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  safeHttpUrl,
} from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { quotationCreate, quotationUpdate } from "@/lib/schemas";
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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "./auth";
import { ProductName, UserName } from "./entities";
import { FormSelect, ProductOptions } from "./pickers";

const APPROVAL_TONE: Record<ApprovalStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

function QuotationDialog({
  leadId,
  quotation,
  open,
  onOpenChange,
}: {
  leadId: string;
  quotation?: Quotation;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const editing = Boolean(quotation);
  const { can } = useAuth();
  const { create, update } = useQuotationMutations(leadId);
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(editing ? quotationUpdate : quotationCreate, {
    product_id: quotation?.product_id ?? "",
    amount: quotation?.amount != null ? String(quotation.amount) : "",
    currency: quotation?.currency ?? "USD",
    file_url: quotation?.file_url ?? "",
    ...(editing ? { status: quotation!.status } : {}),
  } as never);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      if (editing)
        await update.mutateAsync({
          id: quotation!.id,
          body: values as Record<string, unknown>,
        });
      else await create.mutateAsync(values as Record<string, unknown>);
      toast.success(editing ? "Quotation updated" : "Quotation added");
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? "Edit quotation" : "New quotation"}
        description="Prices are recorded here; the buyer-facing document is linked, not stored."
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
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field
              label="Amount"
              error={errors.amount?.message as string | undefined}
            >
              <Input
                inputMode="decimal"
                placeholder="0.00"
                {...form.register("amount" as never)}
              />
            </Field>
            <Field
              label="Currency"
              error={errors.currency?.message as string | undefined}
            >
              <Input
                maxLength={3}
                autoCapitalize="characters"
                placeholder="USD"
                {...form.register("currency" as never)}
              />
            </Field>
          </div>
          <Field
            label="Quotation link"
            hint="A link to the PDF or shared document."
            error={errors.file_url?.message as string | undefined}
          >
            <Input
              type="url"
              inputMode="url"
              placeholder="https://…"
              {...form.register("file_url" as never)}
            />
          </Field>
          {editing && (
            <FormSelect
              control={form.control as never}
              name="status"
              label="Status with the buyer"
            >
              {QUOTATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {QUOTATION_STATUS_LABEL[s]}
                </option>
              ))}
            </FormSelect>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? "Save changes" : "Add quotation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuotationCard({ q, leadId }: { q: Quotation; leadId: string }) {
  const { can } = useAuth();
  const { decide } = useQuotationMutations(leadId);
  const [editing, setEditing] = React.useState(false);
  const link = safeHttpUrl(q.file_url);

  return (
    <li className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[20px] font-semibold tabular">
            {formatMoney(q.amount, q.currency)}
          </p>
          <p className="text-[14px] text-muted">
            <ProductName id={q.product_id} /> · added {formatDate(q.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* Two separate fields on purpose: what the buyer has seen vs. our internal sign-off. */}
          <Badge tone="neutral">
            Buyer: {QUOTATION_STATUS_LABEL[q.status]}
          </Badge>
          <Badge tone={APPROVAL_TONE[q.approval_status]} dot>
            {APPROVAL_LABEL[q.approval_status]}
          </Badge>
        </div>
      </div>

      {q.approval_status !== "pending" && (
        <p className="text-[13px] text-muted">
          {q.approval_status === "approved" ? "Approved" : "Rejected"} by{" "}
          {q.approved_by_user_id ? (
            <UserName id={q.approved_by_user_id} />
          ) : (
            "—"
          )}
          {q.approved_at && <> on {formatDateTime(q.approved_at)}</>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {link && (
          <Button asChild variant="secondary" size="sm">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              Open document
            </a>
          </Button>
        )}
        {can("quotations:write") && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        )}
        {can("quotations:approve") && q.approval_status === "pending" && (
          <>
            <Button
              size="sm"
              variant="tint"
              loading={
                decide.isPending &&
                decide.variables?.id === q.id &&
                decide.variables.decision === "approve"
              }
              onClick={() => decide.mutate({ id: q.id, decision: "approve" })}
            >
              <Check aria-hidden />
              Approve
            </Button>
            <Button
              size="sm"
              variant="danger-tint"
              loading={
                decide.isPending &&
                decide.variables?.id === q.id &&
                decide.variables.decision === "reject"
              }
              onClick={() => decide.mutate({ id: q.id, decision: "reject" })}
            >
              <X aria-hidden />
              Reject
            </Button>
          </>
        )}
      </div>
      {editing && (
        <QuotationDialog
          leadId={leadId}
          quotation={q}
          open
          onOpenChange={setEditing}
        />
      )}
    </li>
  );
}

export function QuotationsPanel({ leadId }: { leadId: string }) {
  const { can } = useAuth();
  const q = useQuotations(leadId, can("quotations:read"));
  const [creating, setCreating] = React.useState(false);

  if (!can("quotations:read"))
    return <EmptyState title="Quotations aren't available for your role" />;
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <p className="text-[14px] text-muted">
          {q.data
            ? `${q.data.length} quotation${q.data.length === 1 ? "" : "s"}`
            : " "}
        </p>
        {can("quotations:write") && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New quotation
          </Button>
        )}
      </div>
      {q.isPending ? (
        <RowsSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotations yet"
          description="Add one when you've priced this lead. Managers approve it before it goes out."
        />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((x) => (
            <QuotationCard key={x.id} q={x} leadId={leadId} />
          ))}
        </ul>
      )}
      {creating && (
        <QuotationDialog leadId={leadId} open onOpenChange={setCreating} />
      )}
    </div>
  );
}
