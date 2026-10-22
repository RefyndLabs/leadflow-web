"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  Globe,
  Mail,
  MessageCircle,
  MessageSquareText,
  Pencil,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAssignLead,
  useChangeStatus,
  useLeadContext,
  useResumeBot,
  useScoreLead,
  useUpdateLead,
} from "@/lib/api/hooks";
import { ApiError, describeError } from "@/lib/api/errors";
import type {
  Account,
  ContactBrief,
  EventBrief,
  Lead,
  LeadQualityTag,
  LeadStatus,
} from "@/lib/api/types";
import {
  QUALITY_LABEL,
  QUALITY_TAGS,
  STATUS_LABEL,
  sourceLabel,
} from "@/lib/enums";
import { countryName } from "@/lib/countries";
import {
  countryFlag,
  formatDateRange,
  formatDateTime,
  formatPhone,
  formatRelative,
  isPast,
  safeHttpUrl,
  telHref,
  toLocalInput,
} from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { leadUpdate } from "@/lib/schemas";
import { manualTransitions, statusHint } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ErrorState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "./auth";
import { QualityBadge, StatusBadge } from "./badges";
import { ExportDetailsCard } from "./export-details";
import { QuotationsPanel } from "./lead-quotations";
import { LeadProductsCard } from "./lead-products";
import { NotesPanel } from "./lead-notes";
import { SamplesPanel } from "./lead-samples";
import { Thread, TouchpointComposer } from "./lead-thread";
import { PageHeader } from "./page-header";
import { PipelineRail } from "./pipeline-rail";
import { EventOptions, FormSelect, UserOptions } from "./pickers";
import { QualificationPanel } from "./qualification";
import { FirstTouchCard } from "./first-touch";
import { SaveContactButton } from "./save-contact";
import { FromTheShow } from "./transcript";
import { cardSideLabels } from "./card-photos";

/* ── Lost dialog: reason is required by the API when moving to `lost` ─── */
function LostDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const invalid = touched && reason.trim() === "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Mark as lost"
        description="This closes the lead for good. Record why, so the team can learn from it."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (reason.trim()) onSubmit(reason.trim());
          }}
          noValidate
        >
          <Field
            label="Reason"
            required
            error={invalid ? "A reason is required" : undefined}
          >
            <Textarea
              rows={4}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="e.g. Went with a competitor on price"
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              Mark as lost
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit dialog ─────────────────────────────────────────────────────── */
function EditLeadDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { can } = useAuth();
  const update = useUpdateLead(lead.id, {
    handled: true,
    success: "Lead updated",
  });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(leadUpdate, {
    lead_title: lead.lead_title ?? "",
    requirement_summary: lead.requirement_summary ?? "",
    division: lead.division ?? "",
    owner_id: lead.owner_id ?? "",
    quality_tag: lead.quality_tag ?? "",
    event_id: lead.event_id ?? "",
    next_follow_up_at: toLocalInput(lead.next_follow_up_at),
  } as never);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      await update.mutateAsync(values as Record<string, unknown>);
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Edit lead"
        description="Status changes happen from the actions panel; products and export details have their own Edit."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <Field
            label="Lead title"
            error={errors.lead_title?.message as string | undefined}
          >
            <Input maxLength={200} {...form.register("lead_title")} />
          </Field>
          <Field
            label="What they need"
            error={errors.requirement_summary?.message as string | undefined}
          >
            <Textarea
              rows={3}
              maxLength={4000}
              {...form.register("requirement_summary")}
            />
          </Field>
          <Field
            label="Next follow-up"
            error={errors.next_follow_up_at?.message as string | undefined}
          >
            <Input type="datetime-local" {...form.register("next_follow_up_at")} />
          </Field>
          <Field
            label="Division"
            error={errors.division?.message as string | undefined}
          >
            <Input maxLength={200} {...form.register("division")} />
          </Field>
          {can("users:read") && (
            <FormSelect
              control={form.control as never}
              name="owner_id"
              label="Owner"
              placeholder="Unassigned"
            >
              <UserOptions />
            </FormSelect>
          )}
          <FormSelect
            control={form.control as never}
            name="quality_tag"
            label="Quality"
            placeholder="Not rated"
          >
            {QUALITY_TAGS.map((t) => (
              <option key={t} value={t}>
                {QUALITY_LABEL[t]}
              </option>
            ))}
          </FormSelect>
          {can("events:read") && (
            <FormSelect
              control={form.control as never}
              name="event_id"
              label="Exhibition"
              placeholder="None"
            >
              <EventOptions />
            </FormSelect>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Actions: only what is reachable from the current status ─────────── */
function ActionsCard({ lead }: { lead: Lead }) {
  const { me, can } = useAuth();
  const confirm = useConfirm();
  const change = useChangeStatus(lead.id, { handled: true });
  const score = useScoreLead(lead.id);
  const assign = useAssignLead(lead.id);
  const pause = useUpdateLead(lead.id, { handled: true });
  const [lostOpen, setLostOpen] = React.useState(false);
  // The pause switch flips at once; the refetched lead (or a failure) settles it.
  const [pausing, setPausing] = React.useState<boolean | null>(null);
  const paused = pausing ?? lead.follow_ups_paused ?? false;
  if (pausing !== null && pausing === (lead.follow_ups_paused ?? false)) setPausing(null);
  const targets = manualTransitions(lead.status);
  const canWrite = can("leads:write");

  const move = async (target: LeadStatus, reason?: string) => {
    try {
      await change.mutateAsync({
        status: target,
        ...(reason ? { reason } : {}),
      });
      setLostOpen(false);
      toast.success(`Moved to ${STATUS_LABEL[target]}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // State moved under us (someone else acted first). The hook already refetched.
        toast.error(
          `Can't move this lead from ${STATUS_LABEL[lead.status]} to ${STATUS_LABEL[target]}. It may have just been changed by someone else.`,
        );
        setLostOpen(false);
      } else toast.error(describeError(e));
    }
  };

  const onPick = async (target: LeadStatus) => {
    if (target === "lost") return setLostOpen(true);
    if (target === "won") {
      const ok = await confirm({
        title: "Mark as won?",
        description: "This closes the lead. Won leads can't be reopened.",
        confirmLabel: "Mark as won",
      });
      if (!ok) return;
    }
    await move(target);
  };

  const togglePause = async (paused: boolean) => {
    setPausing(paused);
    try {
      await pause.mutateAsync({ follow_ups_paused: paused });
      toast.success(
        paused ? "Automated follow-ups paused" : "Automated follow-ups resumed",
      );
    } catch (e) {
      setPausing(null);
      toast.error(describeError(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next step</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="space-y-2">
          {!canWrite ? (
            <p className="text-[14px] text-muted">
              You can view this lead but not change it.
            </p>
          ) : targets.length > 0 ? (
            <div className="flex flex-col gap-2">
              {targets.map((t) => (
                <Button
                  key={t}
                  variant={
                    t === "quotation_requested" || t === "won"
                      ? "primary"
                      : t === "lost"
                        ? "danger-tint"
                        : "secondary"
                  }
                  loading={change.isPending && change.variables?.status === t}
                  disabled={change.isPending}
                  onClick={() => void onPick(t)}
                >
                  {t === "quotation_requested" && "Quotation requested"}
                  {t === "in_conversation" && "Back to conversation"}
                  {t === "won" && "Mark as won"}
                  {t === "lost" && "Mark as lost…"}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-muted">{statusHint(lead.status)}</p>
          )}
        </div>

        {canWrite && (
          <>
            <div className="space-y-2">
              <p className="text-[13px] font-medium">Your rating</p>
              <Segmented<LeadQualityTag>
                label="Lead quality"
                value={lead.quality_tag}
                onValueChange={(v) => score.mutate(v)}
                disabled={score.isPending}
                options={QUALITY_TAGS.map((t) => ({
                  value: t,
                  label: QUALITY_LABEL[t],
                }))}
              />
            </div>

            <div className="space-y-2">
              <p className="text-[13px] font-medium">Owner</p>
              {can("users:read") ? (
                <Select
                  aria-label="Owner"
                  value={lead.owner_id ?? ""}
                  disabled={assign.isPending}
                  onChange={(e) => assign.mutate(e.target.value || null)}
                >
                  <option value="">Unassigned</option>
                  <UserOptions />
                </Select>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={assign.isPending || lead.owner_id === me.id}
                    onClick={() => assign.mutate(me.id)}
                  >
                    Assign to me
                  </Button>
                  {lead.owner_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={assign.isPending}
                      onClick={() => assign.mutate(null)}
                    >
                      Unassign
                    </Button>
                  )}
                </div>
              )}
            </div>

            <label className="flex items-start gap-3 text-[14px]">
              <Checkbox
                className="mt-0.5"
                checked={paused}
                disabled={pause.isPending}
                onChange={(e) => void togglePause(e.target.checked)}
              />
              <span>
                <span className="font-medium">Pause automated follow-ups</span>
                <span className="block text-[13px] text-muted">
                  While paused, no scheduled WhatsApp or email messages go out
                  for this lead.
                </span>
              </span>
            </label>
          </>
        )}
      </CardBody>
      <LostDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        pending={change.isPending}
        onSubmit={(r) => void move("lost", r)}
      />
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

const Dash = () => <span className="text-muted">—</span>;

/** wa.me only takes digits. */
const waHref = (n: string) => `https://wa.me/${n.replace(/\D/g, "")}`;
const mailHref = (e: string) =>
  `mailto:${encodeURIComponent(e).replace(/%40/g, "@")}`;

function ContactCard({
  contact,
  account,
  event,
}: {
  contact: ContactBrief;
  account: Account | null;
  event: EventBrief | null;
}) {
  const site = safeHttpUrl(account?.website);
  const country = account?.country;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-2 text-[18px] font-semibold text-muted"
            aria-hidden
          >
            {contact.name
              .split(/\s+/)
              .filter(Boolean)
              .map((p, i, a) => (i === 0 || i === a.length - 1 ? p[0] : ""))
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold">
              <Link href={`/contacts/${contact.id}`} className="hover:underline">
                {contact.name}
              </Link>
            </p>
            <p className="truncate text-[14px] text-muted">
              {contact.designation && <>{contact.designation} · </>}
              {account ? (
                <Link href={`/accounts/${account.id}`} className="hover:underline">
                  {account.name}
                </Link>
              ) : (
                "—"
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {contact.phone && (
            <Button asChild variant="secondary" size="sm">
              <a href={telHref(contact.phone)}>
                <Phone aria-hidden />
                Call {formatPhone(contact.phone)}
              </a>
            </Button>
          )}
          {(contact.whatsapp || contact.phone) && (
            <Button asChild variant="secondary" size="sm">
              <a
                href={waHref(contact.whatsapp ?? contact.phone!)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle aria-hidden />
                WhatsApp
              </a>
            </Button>
          )}
          {contact.email && (
            <Button asChild variant="secondary" size="sm">
              <a href={mailHref(contact.email)}>
                <Mail aria-hidden />
                Email
              </a>
            </Button>
          )}
          <SaveContactButton
            card={{
              name: contact.name,
              phone: contact.phone,
              alternatePhone: contact.alternate_phone,
              whatsapp: contact.whatsapp,
              email: contact.email,
              company: account?.name,
              title: contact.designation,
              website: site,
              note: event ? `Met at ${event.name}` : null,
            }}
          />
        </div>
        <dl className="divide-y divide-line border-t border-line">
          <Row label="Email">
            {contact.email ? (
              <a href={mailHref(contact.email)} className="text-accent hover:underline">
                {contact.email}
              </a>
            ) : (
              <Dash />
            )}
          </Row>
          <Row label="Phone">
            {contact.phone ? formatPhone(contact.phone) : <Dash />}
          </Row>
          <Row label="WhatsApp">
            {contact.whatsapp && contact.whatsapp !== contact.phone ? (
              formatPhone(contact.whatsapp)
            ) : contact.phone ? (
              <span className="text-muted">Same as phone</span>
            ) : (
              <Dash />
            )}
          </Row>
          {contact.alternate_phone && (
            <Row label="Alternate number">
              <a href={telHref(contact.alternate_phone)} className="text-accent hover:underline">
                {formatPhone(contact.alternate_phone)}
              </a>
            </Row>
          )}
          <Row label="Website">
            {site ? (
              <a
                href={site}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                <Globe className="size-3.5" aria-hidden />
                {account!.website!.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            ) : (
              <Dash />
            )}
          </Row>
          <Row label="Country">
            {country ? (
              <>
                <span aria-hidden>{countryFlag(country)} </span>
                {countryName(country)}
              </>
            ) : (
              <Dash />
            )}
          </Row>
        </dl>
        {account?.review_status === "needs_review" && (
          <InlineAlert tone="warning">
            This company may be a duplicate.{" "}
            <Link href={`/accounts/${account.id}`} className="font-medium underline">
              Review it
            </Link>
          </InlineAlert>
        )}
      </CardBody>
    </Card>
  );
}

/** Small chip linking to the exhibition the lead came from. */
function EventChip({ event }: { event: EventBrief }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] font-medium text-accent hover:underline"
    >
      <CalendarDays className="size-3.5" aria-hidden />
      {event.name}
    </Link>
  );
}

function FollowUp({ at, closed }: { at: string | null | undefined; closed: boolean }) {
  if (!at) return <Dash />;
  const overdue = !closed && isPast(at);
  return (
    <span className={cn(overdue && "font-medium text-danger")}>
      {overdue && "Overdue · "}
      {formatDateTime(at)}
    </span>
  );
}

/** The WhatsApp bot handed this conversation to a person: it stays quiet, and
 * automated follow-ups skip the lead, until someone lets it resume. */
function BotHandoffBanner({ lead, canWrite }: { lead: Lead; canWrite: boolean }) {
  const resume = useResumeBot(lead.id);
  const confirm = useConfirm();
  if (!lead.bot_handoff_at) return null;
  const why =
    lead.bot_handoff_type === "human_requested"
      ? "the customer asked to talk to a person"
      : "they asked about price, samples or an order";

  const onResume = async () => {
    const ok = await confirm({
      title: "Let the WhatsApp bot reply again?",
      description:
        "The bot will answer this customer's next WhatsApp message, and automated follow-ups start again.",
      confirmLabel: "Let the bot reply",
    });
    if (ok) resume.mutate();
  };

  return (
    <InlineAlert tone="warning" className="mb-4">
      <span className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <span className="font-medium">Handed to your team</span> by the
          WhatsApp bot {formatRelative(lead.bot_handoff_at)}, because {why}.
          The bot stays quiet and automated follow-ups are paused until you
          let it reply again.
          {lead.bot_handoff_reason && (
            <span className="mt-1 block text-[13px]">
              Bot&apos;s note: {lead.bot_handoff_reason}
            </span>
          )}
        </span>
        {canWrite && (
          <Button
            variant="secondary"
            size="sm"
            loading={resume.isPending}
            onClick={() => void onResume()}
          >
            Let the bot reply
          </Button>
        )}
      </span>
    </InlineAlert>
  );
}

export function LeadDetail({ id }: { id: string }) {
  const { can } = useAuth();
  const q = useLeadContext(id);
  const [editing, setEditing] = React.useState(false);

  if (q.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-16 w-full rounded-[14px]" />
        <Skeleton className="h-80 w-full rounded-[14px]" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <>
        <PageHeader title="Lead" back={{ href: "/leads", label: "Leads" }} />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </>
    );
  }

  const { lead, contact, account, event, owner, products, notes, touchpoints, captures, research, outreach } = q.data;
  const closed = lead.status === "won" || lead.status === "lost";
  const canWrite = can("leads:write");
  const showCapture = captures.find((c) => c.card || c.card_back || c.voice || c.extracted);

  return (
    <>
      <PageHeader
        back={{ href: "/leads", label: "Leads" }}
        title={contact.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {contact.designation && (
              <>
                {contact.designation}
                <span aria-hidden>·</span>
              </>
            )}
            {account ? (
              <Link href={`/accounts/${account.id}`} className="hover:underline">
                {account.country && <span aria-hidden>{countryFlag(account.country)} </span>}
                {account.name}
              </Link>
            ) : (
              "—"
            )}
            <span aria-hidden>·</span>
            {sourceLabel(lead.source)}
            <span aria-hidden>·</span>
            created {formatRelative(lead.created_at)}
            {event && <EventChip event={event} />}
            {lead.lead_title && (
              <span className="basis-full text-foreground">
                {lead.lead_title}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <StatusBadge status={lead.status} />
            <QualityBadge tag={lead.quality_tag} />
            {typeof lead.qualification_score === "number" && (
              <Badge tone="neutral">AI {lead.qualification_score}</Badge>
            )}
            {lead.follow_ups_paused && <Badge>Follow-ups paused</Badge>}
            {lead.bot_handoff_at && <Badge>Handed to team</Badge>}
            {canWrite && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden />
                Edit
              </Button>
            )}
          </>
        }
      />

      <BotHandoffBanner lead={lead} canWrite={canWrite} />
      {lead.requirement_summary && (
        <p className="mb-4 rounded-[12px] bg-surface-2 px-4 py-3 text-[14px]">
          <span className="text-muted">They need: </span>
          {lead.requirement_summary}
        </p>
      )}
      <Card className="mb-4">
        <CardBody>
          <PipelineRail status={lead.status} />
          {lead.status === "lost" && lead.lost_reason && (
            <p className="mt-4 rounded-[10px] bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">
              <span className="font-medium">Lost:</span> {lead.lost_reason}
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <FirstTouchCard
            leadId={lead.id}
            run={outreach}
            contact={contact}
            canWrite={canWrite}
            closed={closed}
          />
          <QualificationPanel lead={lead} research={research} canWrite={canWrite} />
          <NotesPanel leadId={lead.id} notes={notes} canWrite={canWrite} />
          <Tabs defaultValue="conversation">
            <TabsList aria-label="Lead sections">
              <TabsTrigger value="conversation">
                <MessageSquareText className="size-4" aria-hidden />
                Conversation
                <span className="rounded-full bg-surface-2 px-1.5 text-[12px] tabular">
                  {touchpoints.length}
                </span>
              </TabsTrigger>
              {can("quotations:read") && (
                <TabsTrigger value="quotations">Quotations</TabsTrigger>
              )}
              {can("samples:read") && (
                <TabsTrigger value="samples">Samples</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="conversation" className="space-y-4">
              <Card>
                <CardBody>
                  <Thread touchpoints={touchpoints} imageLabels={cardSideLabels(captures)} />
                </CardBody>
              </Card>
              {can("touchpoints:write") && !closed && (
                <TouchpointComposer leadId={lead.id} />
              )}
            </TabsContent>
            <TabsContent value="quotations">
              <QuotationsPanel leadId={lead.id} />
            </TabsContent>
            <TabsContent value="samples">
              <SamplesPanel leadId={lead.id} />
            </TabsContent>
          </Tabs>
          {showCapture && <FromTheShow capture={showCapture} />}
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <ContactCard contact={contact} account={account} event={event} />
          <ActionsCard lead={lead} />
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody className="pt-2">
              <dl className="divide-y divide-line">
                <Row label="Owner">
                  {owner ? owner.name : <span className="text-muted">Unassigned</span>}
                </Row>
                <Row label="Next follow-up">
                  <FollowUp at={lead.next_follow_up_at} closed={closed} />
                </Row>
                <Row label="Division">{lead.division ?? <Dash />}</Row>
                <Row label="Exhibition">
                  {event ? (
                    <Link href={`/events/${event.id}`} className="hover:underline">
                      {event.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Row>
                {event && (
                  <Row label="Show dates">{formatDateRange(event.date, event.end_date)}</Row>
                )}
                <Row label="Created">{formatDateTime(lead.created_at)}</Row>
                <Row label="Last activity">
                  {formatDateTime(q.data.last_activity_at ?? lead.updated_at)}
                </Row>
              </dl>
              {can("audit:read") && (
                <Link
                  href={`/settings/audit?entity_id=${lead.id}`}
                  className="mt-3 inline-block text-[13px] text-accent hover:underline"
                >
                  View change history
                </Link>
              )}
            </CardBody>
          </Card>
          <LeadProductsCard leadId={lead.id} items={products} canWrite={canWrite} />
          <ExportDetailsCard
            lead={lead}
            canWrite={canWrite}
            products={products}
          />
        </div>
      </div>

      {editing && <EditLeadDialog lead={lead} open onOpenChange={setEditing} />}
    </>
  );
}
