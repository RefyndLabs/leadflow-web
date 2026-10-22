"use client";

import * as React from "react";
import { useOrganization, useUpdateOrganization } from "@/lib/api/hooks";
import {
  DEFAULT_PHONE_REGION,
  countryName,
  countryOptions,
} from "@/lib/countries";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { organizationUpdate } from "@/lib/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { useAuth } from "./auth";
import { PageHeader } from "./page-header";
import { FormSelect } from "./pickers";
import type { Organization } from "@/lib/api/types";

function formValues(org: Organization) {
  return {
    name: org.name,
    new_lead_gap_hours: String(org.new_lead_gap_hours ?? 72),
    fuzzy_match_threshold: String(org.fuzzy_match_threshold ?? 85),
    assignment_strategy: org.assignment_strategy ?? "round_robin",
    default_phone_region: org.default_phone_region ?? "",
    business_description: org.business_description ?? "",
    website: org.website ?? "",
    auto_research_new_leads: org.auto_research_new_leads ?? false,
    first_touch_auto_send: org.first_touch_auto_send ?? false,
    error_alert_email: org.error_alert_email ?? "",
    exhibition_reviewer_email: org.exhibition_reviewer_email ?? "",
    handoff_email: org.handoff_email ?? "",
  };
}

function SettingsForm({
  org,
  canWrite,
}: {
  org: Organization;
  canWrite: boolean;
}) {
  const update = useUpdateOrganization();
  // Every country with its calling code, sorted by name, with the saved one first.
  const countries = React.useMemo(() => {
    const all = countryOptions();
    const current = all.find((c) => c.code === org.default_phone_region);
    return current ? [current, ...all.filter((c) => c !== current)] : all;
  }, [org.default_phone_region]);
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(organizationUpdate, formValues(org) as never);
  const { errors, isDirty } = form.formState;

  // Reflect saves made elsewhere (one list of fields for the first fill and every refill).
  React.useEffect(() => {
    form.reset(formValues(org) as never);
  }, [org, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      await update.mutateAsync(values as Record<string, unknown>);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!canWrite} className="space-y-5">
        {banner && <InlineAlert>{banner}</InlineAlert>}
        <Field
          label="Organization name"
          required
          error={errors.name?.message as string | undefined}
        >
          <Input maxLength={300} {...form.register("name")} />
        </Field>
        <Field
          label="New-lead gap (hours)"
          required
          error={errors.new_lead_gap_hours?.message as string | undefined}
          hint="If a contact writes again after this long, it starts a new lead instead of a reply on the old one. A closed (won or lost) lead always starts a new one."
        >
          <Input
            inputMode="numeric"
            {...form.register("new_lead_gap_hours" as never)}
          />
        </Field>
        <Field
          label="Company match sensitivity (50–100)"
          required
          error={errors.fuzzy_match_threshold?.message as string | undefined}
          hint="How similar two company names must be before they're linked or flagged. Higher is stricter; lower flags more possible duplicates."
        >
          <Input
            inputMode="decimal"
            {...form.register("fuzzy_match_threshold" as never)}
          />
        </Field>
        <FormSelect
          control={form.control as never}
          name="assignment_strategy"
          label="Lead assignment"
          required
          hint="Round robin shares new leads evenly. Division matches a lead's division to team members in the same division."
        >
          <option value="round_robin">Round robin</option>
          <option value="division">By division</option>
        </FormSelect>
        <FormSelect
          control={form.control as never}
          name="default_phone_region"
          label="Default country for phone numbers"
          hint="Used for numbers typed without a country code, e.g. 98765 43210. Numbers with a +code are always kept as typed."
        >
          <option value="">
            Default ({countryName(DEFAULT_PHONE_REGION)})
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </FormSelect>

        <div className="space-y-4 border-t border-line pt-5">
          <div>
            <h3 className="text-[15px] font-semibold">Lead research</h3>
            <p className="text-[13px] text-muted">
              The AI looks leads up in public sources and suggests a score. It compares them with
              what you sell.
            </p>
          </div>
          <Field
            label="Company profile"
            error={errors.business_description?.message as string | undefined}
            hint="Used by the AI to judge product fit. What you make, for whom, and where you export."
          >
            <Textarea rows={5} maxLength={4000} {...form.register("business_description")} />
          </Field>
          <Field label="Website" error={errors.website?.message as string | undefined}>
            <Input
              autoCapitalize="none"
              inputMode="url"
              maxLength={500}
              placeholder="example.com"
              {...form.register("website")}
            />
          </Field>
          <label className="flex items-start gap-3 text-[14px]">
            <Checkbox className="mt-0.5" {...form.register("auto_research_new_leads")} />
            <span>
              <span className="font-medium">Research every new lead automatically</span>
              <span className="block text-[13px] text-muted">
                Leads confirmed from a show capture are researched anyway, unless the reviewer unticks it.
              </span>
            </span>
          </label>
        </div>
        <div className="space-y-4 border-t border-line pt-5">
          <div>
            <h3 className="text-[15px] font-semibold">First messages</h3>
            <p className="text-[13px] text-muted">
              When a lead is saved from a show, AI writes a personal message to the buyer from the
              conversation, the notes and the card.
            </p>
          </div>
          <label className="flex items-start gap-3 text-[14px]">
            <Checkbox className="mt-0.5" {...form.register("first_touch_auto_send")} />
            <span>
              <span className="font-medium">Send first messages without review</span>
              <span className="block text-[13px] text-muted">
                On: it goes out as soon as it is written. Off: each one waits on the lead page until
                someone approves it. Leads with follow-ups paused are never messaged automatically.
              </span>
            </span>
          </label>
        </div>
        <div className="space-y-4 border-t border-line pt-5">
          <div>
            <h3 className="text-[15px] font-semibold">Notifications</h3>
            <p className="text-[13px] text-muted">
              Where the automation sends emails. Leave a box empty to send nothing of that kind.
            </p>
          </div>
          <Field
            label="Show leads to review"
            error={errors.exhibition_reviewer_email?.message as string | undefined}
            hint="Gets each lead captured at a show once it has been read, so someone can check and confirm it."
          >
            <Input
              type="email"
              autoCapitalize="none"
              maxLength={320}
              {...form.register("exhibition_reviewer_email")}
            />
          </Field>
          <Field
            label="Conversations handed to a person"
            error={errors.handoff_email?.message as string | undefined}
            hint="Gets a message when the WhatsApp assistant stops and asks a person to take over a chat."
          >
            <Input
              type="email"
              autoCapitalize="none"
              maxLength={320}
              {...form.register("handoff_email")}
            />
          </Field>
          <Field
            label="Automation problems"
            error={errors.error_alert_email?.message as string | undefined}
            hint="Gets an alert when an automated step fails, for example a message that could not be sent."
          >
            <Input
              type="email"
              autoCapitalize="none"
              maxLength={320}
              {...form.register("error_alert_email")}
            />
          </Field>
        </div>
      </fieldset>
      {canWrite ? (
        <div className="mt-6 flex justify-end">
          <Button
            type="submit"
            loading={form.formState.isSubmitting}
            disabled={!isDirty}
          >
            Save settings
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-muted">
          Only admins can change these settings.
        </p>
      )}
    </form>
  );
}

export function OrganizationSettings() {
  const { can } = useAuth();
  const q = useOrganization();
  return (
    <>
      <PageHeader
        title="Organization"
        description="How your workspace matches duplicates and assigns leads."
      />
      {q.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-[14px]" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="grid max-w-3xl gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardBody>
              <SettingsForm org={q.data} canWrite={can("org:write")} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardBody className="pt-2">
              <dl className="divide-y divide-line text-[14px]">
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted">Workspace ID</dt>
                  <dd className="font-mono">{q.data.slug}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted">Plan</dt>
                  <dd>{q.data.plan ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2.5">
                  <dt className="text-muted">Status</dt>
                  <dd>
                    {q.data.is_active ? (
                      <Badge tone="success" dot>
                        Active
                      </Badge>
                    ) : (
                      <Badge tone="danger" dot>
                        Suspended
                      </Badge>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[13px] text-muted">
                The workspace ID, plan and status are managed by your provider
                and can&apos;t be changed here.
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
