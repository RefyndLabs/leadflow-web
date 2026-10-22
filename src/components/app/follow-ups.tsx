"use client";

import * as React from "react";
import Link from "next/link";
import {
  BellRing,
  ChevronRight,
  Clock,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  cadences,
  messageTemplates,
  useDueCadences,
  useSweepStale,
} from "@/lib/api/hooks";
import { describeError } from "@/lib/api/errors";
import type { Cadence, Lead, MessageTemplate } from "@/lib/api/types";
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/enums";
import { formatRelative } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import {
  cadenceCreate,
  cadenceUpdate,
  messageTemplateCreate,
  messageTemplateUpdate,
} from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  RowsSkeleton,
} from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "./auth";
import { StatusBadge } from "./badges";
import { AccountName, ContactAvatar, ContactName } from "./entities";
import { PageHeader } from "./page-header";
import { FormSelect } from "./pickers";

function hoursLabel(h: number): string {
  if (h === 0) return "immediately";
  if (h % 24 === 0) return `${h / 24} day${h === 24 ? "" : "s"}`;
  return `${h} hour${h === 1 ? "" : "s"}`;
}

function CadenceDialog({
  cadence,
  open,
  onOpenChange,
}: {
  cadence?: Cadence;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const editing = Boolean(cadence);
  const create = cadences.useCreate({ handled: true, success: "Rule added" });
  const update = cadences.useUpdate({ handled: true, success: "Rule updated" });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(editing ? cadenceUpdate : cadenceCreate, {
    lead_status: cadence?.lead_status ?? "in_conversation",
    delay_hours: cadence ? String(cadence.delay_hours) : "24",
    message_template_id: cadence?.message_template_id ?? "",
    email_message_template_id: cadence?.email_message_template_id ?? "",
  } as never);
  const { errors } = form.formState;
  const templates = messageTemplates.useList({ limit: 200 });
  const keysFor = (channel: string) =>
    (templates.data?.items ?? [])
      .filter((t) => t.channel === channel)
      .map((t) => t.key);

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      if (editing)
        await update.mutateAsync({
          id: cadence!.id,
          body: values as Record<string, unknown>,
        });
      else await create.mutateAsync(values as Record<string, unknown>);
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? "Edit follow-up rule" : "New follow-up rule"}
        description="When a lead has been in a status for a while, this message is due."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          <FormSelect
            control={form.control as never}
            name="lead_status"
            label="When a lead is"
            required
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </FormSelect>
          <Field
            label="For at least (hours)"
            required
            error={errors.delay_hours?.message as string | undefined}
            hint="24 = one day, 168 = one week."
          >
            <Input
              inputMode="numeric"
              {...form.register("delay_hours" as never)}
            />
          </Field>
          <Field
            label="WhatsApp message"
            required
            error={errors.message_template_id?.message as string | undefined}
            hint="The key of a message on the Messages tab, for example nudge-followup-1."
          >
            <Input
              maxLength={300}
              autoCapitalize="none"
              spellCheck={false}
              list="whatsapp-message-keys"
              {...form.register("message_template_id")}
            />
          </Field>
          <datalist id="whatsapp-message-keys">
            {keysFor("whatsapp").map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <Field
            label="Email message"
            error={
              errors.email_message_template_id?.message as string | undefined
            }
            hint="Optional. Used when the follow-up goes by email instead of WhatsApp."
          >
            <Input
              maxLength={300}
              autoCapitalize="none"
              spellCheck={false}
              list="email-message-keys"
              {...form.register("email_message_template_id" as never)}
            />
          </Field>
          <datalist id="email-message-keys">
            {keysFor("email").map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? "Save changes" : "Add rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DueList() {
  const { can } = useAuth();
  const due = useDueCadences();
  const sweep = useSweepStale({ handled: true });
  const [swept, setSwept] = React.useState<Lead[] | null>(null);
  const confirm = useConfirm();

  const runSweep = async () => {
    const ok = await confirm({
      title: "Run the stale sweep now?",
      description:
        "Leads with no reply inside the follow-up window will move to Stale. This normally runs on a schedule, so only run it by hand to test.",
      confirmLabel: "Run sweep",
    });
    if (!ok) return;
    try {
      const moved = await sweep.mutateAsync();
      setSwept(moved);
      toast.success(
        moved.length === 0
          ? "Nothing to mark stale"
          : `${moved.length} lead${moved.length === 1 ? "" : "s"} marked stale`,
      );
    } catch (e) {
      toast.error(describeError(e));
    }
  };

  return (
    <div className="space-y-4">
      {can("leads:sweep") && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 sm:px-5">
          <p className="text-[14px] text-muted">
            Testing without n8n running? Trigger the stale sweep by hand.
          </p>
          <Button
            variant="secondary"
            size="sm"
            loading={sweep.isPending}
            onClick={() => void runSweep()}
          >
            <RefreshCw aria-hidden />
            Run stale sweep
          </Button>
        </div>
      )}
      {swept && swept.length > 0 && (
        <InlineAlert tone="warning">
          Marked stale:{" "}
          {swept.map((l, i) => (
            <React.Fragment key={l.id}>
              {i > 0 && ", "}
              <Link href={`/leads/${l.id}`} className="font-medium underline">
                <ContactName id={l.contact_id} />
              </Link>
            </React.Fragment>
          ))}
        </InlineAlert>
      )}
      <Card className="overflow-hidden">
        {due.isPending ? (
          <RowsSkeleton rows={4} />
        ) : due.isError ? (
          <ErrorState error={due.error} onRetry={() => void due.refetch()} />
        ) : due.data.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title="Nothing due right now"
            description="Leads show up here once they've sat in a status longer than a follow-up rule allows. Add rules on the next tab."
          />
        ) : (
          <ul className="divide-y divide-line">
            {due.data.map(({ lead, cadence }) => (
              <li key={`${lead.id}-${cadence.id}`}>
                <Link
                  href={`/leads/${lead.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 sm:px-5"
                >
                  <ContactAvatar id={lead.contact_id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      <ContactName id={lead.contact_id} />
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      <AccountName id={lead.account_id} /> · template{" "}
                      <span className="font-mono">
                        {cadence.message_template_id}
                      </span>{" "}
                      · in {STATUS_LABEL[lead.status].toLowerCase()} since{" "}
                      {formatRelative(lead.updated_at)}
                    </span>
                  </span>
                  <StatusBadge status={lead.status} />
                  <ChevronRight
                    className="hidden size-4 shrink-0 text-muted sm:block"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Rules() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const q = cadences.useList({ limit: 200 });
  const remove = cadences.useRemove({ success: "Rule deleted" });
  const [dialog, setDialog] = React.useState<{ cadence?: Cadence } | null>(
    null,
  );
  const canWrite = can("cadences:write");

  return (
    <div className="space-y-4">
      <InlineAlert tone="accent">
        These rules decide <em>when</em> a follow-up is due. What it says is on
        the Messages tab: each rule names a message by its key.
      </InlineAlert>
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({})}>
            <Plus aria-hidden />
            New rule
          </Button>
        </div>
      )}
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No follow-up rules yet"
            description="Add a rule such as “when a lead is In conversation for 1 day, send message nudge-followup-1”."
            action={
              canWrite ? (
                <Button onClick={() => setDialog({})}>
                  <Plus aria-hidden />
                  Add the first rule
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.items
              .slice()
              .sort(
                (a, b) =>
                  LEAD_STATUSES.indexOf(a.lead_status) -
                    LEAD_STATUSES.indexOf(b.lead_status) ||
                  a.delay_hours - b.delay_hours,
              )
              .map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px]">
                      When <StatusBadge status={c.lead_status} /> for{" "}
                      {hoursLabel(c.delay_hours)}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      WhatsApp message{" "}
                      <span className="font-mono text-foreground">
                        {c.message_template_id}
                      </span>
                      {c.email_message_template_id && (
                        <>
                          {" "}
                          · email{" "}
                          <span className="font-mono text-foreground">
                            {c.email_message_template_id}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit rule for ${STATUS_LABEL[c.lead_status]}`}
                        onClick={() => setDialog({ cadence: c })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete rule for ${STATUS_LABEL[c.lead_status]}`}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Delete this rule?",
                              description:
                                "Follow-ups for this status stop being due. Existing leads are unaffected.",
                              confirmLabel: "Delete rule",
                              destructive: true,
                            })
                          )
                            remove.mutate(c.id);
                        }}
                      >
                        <Trash2 className="text-danger" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        )}
      </Card>
      {dialog && (
        <CadenceDialog
          cadence={dialog.cadence}
          open
          onOpenChange={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function MessageDialog({
  template,
  open,
  onOpenChange,
}: {
  template?: MessageTemplate;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const editing = Boolean(template);
  const create = messageTemplates.useCreate({
    handled: true,
    success: "Message added",
  });
  const update = messageTemplates.useUpdate({
    handled: true,
    success: "Message updated",
  });
  const { banner, setBanner, clear } = useFormBanner();
  const form = useZodForm(
    editing ? messageTemplateUpdate : messageTemplateCreate,
    {
      ...(editing ? {} : { key: "", channel: "whatsapp" }),
      body: template?.body ?? "",
      email_subject: template?.email_subject ?? "",
      whatsapp_template_name: template?.whatsapp_template_name ?? "",
      language: template?.language ?? "en",
    } as never,
  );
  const errors = form.formState.errors as Record<
    string,
    { message?: unknown } | undefined
  >;
  const errorOf = (name: string) => errors[name]?.message as string | undefined;
  const watchedChannel = form.watch("channel" as never) as unknown as
    string | undefined;
  const channel = editing ? template!.channel : watchedChannel;

  const onSubmit = form.handleSubmit(async (values) => {
    clear();
    try {
      if (editing)
        await update.mutateAsync({
          id: template!.id,
          body: values as Record<string, unknown>,
        });
      else await create.mutateAsync(values as Record<string, unknown>);
      onOpenChange(false);
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? `Edit message ${template!.key}` : "New message"}
        description="The text of an automated follow-up. {first_name} and {name} are filled in for each customer."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {banner && <InlineAlert>{banner}</InlineAlert>}
          {!editing && (
            <>
              <Field
                label="Key"
                required
                error={errorOf("key")}
                hint="What follow-up rules use to name this message, e.g. nudge-followup-1. Can't be changed later."
              >
                <Input
                  maxLength={100}
                  autoCapitalize="none"
                  spellCheck={false}
                  {...form.register("key" as never)}
                />
              </Field>
              <FormSelect
                control={form.control as never}
                name="channel"
                label="Sent by"
                required
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </FormSelect>
            </>
          )}
          {channel === "email" && (
            <Field
              label="Email subject"
              required
              error={errorOf("email_subject")}
            >
              <Input
                maxLength={300}
                {...form.register("email_subject" as never)}
              />
            </Field>
          )}
          <Field label="Message" required error={errorOf("body")}>
            <Textarea
              rows={6}
              maxLength={4000}
              {...form.register("body" as never)}
            />
          </Field>
          {channel !== "email" && (
            <Field
              label="Approved WhatsApp template name"
              error={errorOf("whatsapp_template_name")}
              hint="Optional. WhatsApp only delivers plain text within 24 hours of the customer's last message. Name a template approved in Meta (its {{1}} is the first name) to reach them after that."
            >
              <Input
                maxLength={512}
                autoCapitalize="none"
                spellCheck={false}
                {...form.register("whatsapp_template_name" as never)}
              />
            </Field>
          )}
          <Field
            label="Language"
            required
            error={errorOf("language")}
            hint="The language code of the approved template, e.g. en."
          >
            <Input
              maxLength={15}
              autoCapitalize="none"
              spellCheck={false}
              {...form.register("language" as never)}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {editing ? "Save changes" : "Add message"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Messages() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const q = messageTemplates.useList({ limit: 200 });
  const remove = messageTemplates.useRemove({ success: "Message deleted" });
  const [dialog, setDialog] = React.useState<{
    template?: MessageTemplate;
  } | null>(null);
  const canWrite = can("cadences:write");

  return (
    <div className="space-y-4">
      <InlineAlert tone="accent">
        What automated follow-ups say. Follow-up rules pick a message by its
        key. Use {"{first_name}"} or {"{name}"} to address the customer.
      </InlineAlert>
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setDialog({})}>
            <Plus aria-hidden />
            New message
          </Button>
        </div>
      )}
      <Card className="overflow-hidden">
        {q.isPending ? (
          <RowsSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Add the text a follow-up rule sends, for example “Hi {first_name}, just checking in on your enquiry.”"
            action={
              canWrite ? (
                <Button onClick={() => setDialog({})}>
                  <Plus aria-hidden />
                  Add the first message
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.items.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-3 px-4 py-3.5 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">
                    <span className="font-mono">{t.key}</span>{" "}
                    <span className="text-[13px] text-muted">
                      · {t.channel === "email" ? "Email" : "WhatsApp"}
                      {t.whatsapp_template_name &&
                        ` · template ${t.whatsapp_template_name}`}
                    </span>
                  </p>
                  {t.email_subject && (
                    <p className="mt-1 text-[13px] font-medium">
                      {t.email_subject}
                    </p>
                  )}
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-[13px] text-muted">
                    {t.body}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit message ${t.key}`}
                      onClick={() => setDialog({ template: t })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete message ${t.key}`}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `Delete message ${t.key}?`,
                            description:
                              "Rules that use this key stop sending until a message with that key exists again.",
                            confirmLabel: "Delete message",
                            destructive: true,
                          })
                        )
                          remove.mutate(t.id);
                      }}
                    >
                      <Trash2 className="text-danger" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {dialog && (
        <MessageDialog
          template={dialog.template}
          open
          onOpenChange={() => setDialog(null)}
        />
      )}
    </div>
  );
}

export function FollowUps() {
  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="What's due now, the rules that decide when, and what each follow-up says."
      />
      <Tabs defaultValue="due">
        <TabsList aria-label="Follow-up sections">
          <TabsTrigger value="due">Due now</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>
        <TabsContent value="due">
          <DueList />
        </TabsContent>
        <TabsContent value="rules">
          <Rules />
        </TabsContent>
        <TabsContent value="messages">
          <Messages />
        </TabsContent>
      </Tabs>
    </>
  );
}
