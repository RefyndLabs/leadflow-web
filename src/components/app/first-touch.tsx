"use client";

import * as React from "react";
import {
  CheckCircle2,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useOutreachActions } from "@/lib/api/hooks";
import { describeError } from "@/lib/api/errors";
import type { ContactBrief, Outreach } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";

type Channel = "whatsapp" | "email";

/** Same limit as the API: the WhatsApp text may be sent as one parameter of an approved template. */
const WHATSAPP_MAX = 900;
/** A send that has not reported back after this long may be stuck (the API's lease is 15 minutes). */
const STUCK_AFTER_MS = 15 * 60_000;

const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  email: "email",
};

/** The number to WhatsApp, international form, if there is one (same rule as the API). */
function whatsappNumber(c: ContactBrief): string | null {
  return [c.whatsapp, c.phone].find((n) => n?.startsWith("+")) ?? null;
}

function reachable(c: ContactBrief): Record<Channel, boolean> {
  return { whatsapp: whatsappNumber(c) !== null, email: Boolean(c.email) };
}

/** A send that never reported back: the workflow may have died mid-way. */
function isStuck(run: Outreach | null | undefined): boolean {
  if (run?.status !== "sending" || !run.processing_started_at) return false;
  return (
    Date.now() - new Date(run.processing_started_at).getTime() > STUCK_AFTER_MS
  );
}

const waLink = (number: string, text: string) =>
  `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
const mailLink = (to: string, subject: string, body: string) =>
  `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`;

function RewriteDialog({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (instructions: string) => void;
  pending: boolean;
}) {
  const [text, setText] = React.useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Write it again"
        description="Say what should be different, or leave it blank for a fresh attempt."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(text.trim());
          }}
        >
          <Field label="What should change?">
            <Textarea
              rows={3}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Shorter, mention the samples, write in Spanish"
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              <Wand2 aria-hidden />
              Rewrite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The draft, editable, with the ways to send it. */
function DraftEditor({
  run,
  contact,
  actions,
}: {
  run: Outreach;
  contact: ContactBrief;
  actions: ReturnType<typeof useOutreachActions>;
}) {
  const confirm = useConfirm();
  const can = reachable(contact);
  const suggested = run.draft?.suggested_channel;
  const firstChoice: Channel =
    run.channel === "whatsapp" || run.channel === "email"
      ? run.channel
      : suggested && can[suggested]
        ? suggested
        : can.whatsapp || !can.email
          ? "whatsapp"
          : "email";
  const [channel, setChannel] = React.useState<Channel>(firstChoice);
  const [wa, setWa] = React.useState(run.whatsapp_text ?? "");
  const [subject, setSubject] = React.useState(run.email_subject ?? "");
  const [body, setBody] = React.useState(run.email_body ?? "");
  const [rewriting, setRewriting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const edits = {
    whatsapp_text: wa.trim(),
    email_subject: subject.trim(),
    email_body: body.trim(),
  };
  const dirty =
    edits.whatsapp_text !== (run.whatsapp_text ?? "") ||
    edits.email_subject !== (run.email_subject ?? "") ||
    edits.email_body !== (run.email_body ?? "");
  const hasText =
    channel === "whatsapp"
      ? Boolean(edits.whatsapp_text)
      : Boolean(edits.email_subject && edits.email_body);
  const busy =
    actions.approve.isPending ||
    actions.markSent.isPending ||
    actions.save.isPending;
  const number = whatsappNumber(contact);

  const attempt = async (p: Promise<unknown>, success: string) => {
    setError(null);
    try {
      await p;
      toast.success(success);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const approve = () =>
    attempt(
      actions.approve.mutateAsync({ id: run.id, body: { ...edits, channel } }),
      `Approved: it goes out on ${CHANNEL_LABEL[channel]} in a minute or two`,
    );

  const sendMyself = async () => {
    // Opened first, straight from the tap, so the browser doesn't block it as a pop-up.
    const href =
      channel === "whatsapp"
        ? waLink(number!, edits.whatsapp_text)
        : mailLink(contact.email!, edits.email_subject, edits.email_body);
    if (channel === "whatsapp")
      window.open(href, "_blank", "noopener,noreferrer");
    else window.location.href = href;
    const sent = await confirm({
      title: "Did you send it?",
      description:
        channel === "whatsapp"
          ? "Once it's sent from your WhatsApp, mark it here so it's logged on the lead."
          : "Once it's sent from your email app, mark it here so it's logged on the lead.",
      confirmLabel: "Yes, I sent it",
    });
    if (sent)
      await attempt(
        actions.markSent.mutateAsync({
          id: run.id,
          body: { ...edits, channel },
        }),
        "Logged as sent",
      );
  };

  const discard = async () => {
    const ok = await confirm({
      title: "Discard this message?",
      description: "Nothing is sent. You can write a new one later.",
      confirmLabel: "Discard",
      destructive: true,
    });
    if (ok)
      actions.cancel.mutate(run.id, {
        onSuccess: () => toast.success("Message discarded"),
      });
  };

  const notes = run.draft?.review_notes ?? [];
  const basis = run.draft?.personalised_on ?? [];
  return (
    <div className="space-y-4">
      {notes.length > 0 && (
        <InlineAlert tone="warning">
          <p className="font-medium">Check before sending</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      {basis.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-muted">Personalised on:</span>
          {basis.map((b, i) => (
            <Badge
              key={i}
              tone="accent"
              className="whitespace-normal break-words"
            >
              {b}
            </Badge>
          ))}
        </div>
      )}

      <Segmented<Channel>
        label="Send on"
        value={channel}
        onValueChange={setChannel}
        options={[
          {
            value: "whatsapp",
            label: "WhatsApp",
            icon: <MessageCircle className="size-4" aria-hidden />,
          },
          {
            value: "email",
            label: "Email",
            icon: <Mail className="size-4" aria-hidden />,
          },
        ]}
      />

      {channel === "whatsapp" ? (
        <Field
          label="WhatsApp message"
          hint={
            can.whatsapp
              ? `${wa.length} / ${WHATSAPP_MAX} characters`
              : "This contact has no phone or WhatsApp number in international form: add one to send on WhatsApp."
          }
        >
          <Textarea
            rows={6}
            maxLength={WHATSAPP_MAX}
            value={wa}
            onChange={(e) => setWa(e.target.value)}
          />
        </Field>
      ) : (
        <div className="space-y-3">
          {!can.email && (
            <InlineAlert tone="warning">
              This contact has no email address: add one to send by email.
            </InlineAlert>
          )}
          <Field label="Subject">
            <Input
              maxLength={300}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Textarea
              rows={9}
              maxLength={10000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
        </div>
      )}

      {error && <InlineAlert>{error}</InlineAlert>}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          loading={actions.approve.isPending}
          disabled={busy || !can[channel] || !hasText}
          onClick={() => void approve()}
        >
          <Send aria-hidden />
          Approve and send on {CHANNEL_LABEL[channel]}
        </Button>
        <Button
          variant="secondary"
          loading={actions.markSent.isPending}
          disabled={busy || !can[channel] || !hasText}
          onClick={() => void sendMyself()}
        >
          {channel === "whatsapp" ? (
            <MessageCircle aria-hidden />
          ) : (
            <Mail aria-hidden />
          )}
          {channel === "whatsapp"
            ? "Send from my WhatsApp"
            : "Open in my email"}
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            loading={actions.save.isPending}
            disabled={busy}
            onClick={() =>
              void attempt(
                actions.save.mutateAsync({ id: run.id, body: edits }),
                "Changes saved",
              )
            }
          >
            Save changes
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-line pt-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => setRewriting(true)}
        >
          <Wand2 aria-hidden />
          Write it again
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void discard()}
        >
          Discard
        </Button>
      </div>
      <p className="text-[12px] text-muted">
        Written by AI from the conversation at the show, your notes and the
        card. Nothing is sent until you approve it.
      </p>
      {rewriting && (
        <RewriteDialog
          pending={actions.redraft.isPending}
          onClose={() => setRewriting(false)}
          onSubmit={(instructions) =>
            actions.redraft.mutate(
              { id: run.id, instructions: instructions || undefined },
              {
                onSuccess: () => {
                  setRewriting(false);
                  toast.success("Writing it again");
                },
              },
            )
          }
        />
      )}
    </div>
  );
}

function Waiting({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div role="status" className="flex items-start gap-3 py-1">
        <Loader2
          className="mt-0.5 size-5 shrink-0 animate-spin text-accent"
          aria-hidden
        />
        <div>
          <p className="text-[15px] font-medium">{title}</p>
          <p className="text-[13px] text-muted">{detail}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * The personalised first message to the buyer: written by AI from the capture (voice note,
 * typed note, card), checked and approved here, then sent by the workflow or from the rep's
 * own WhatsApp / email. Every state the API can be in has a way forward.
 */
export function FirstTouchCard({
  leadId,
  run,
  contact,
  canWrite,
  closed,
}: {
  leadId: string;
  run: Outreach | null | undefined;
  contact: ContactBrief;
  canWrite: boolean;
  closed: boolean;
}) {
  const actions = useOutreachActions(leadId);
  // Hidden when there is nothing to show and nothing the viewer could do.
  if (!run && (!canWrite || closed)) return null;
  const status = run?.status;
  const stuck = isStuck(run);
  const write = (again: boolean) =>
    actions.request.mutate(
      { again },
      {
        onSuccess: () =>
          toast.success("Writing a personal message — usually under a minute"),
      },
    );
  const sentOn = run?.channel === "email" ? "email" : "WhatsApp";

  return (
    <Card role="region" aria-labelledby="first-touch-title">
      <CardHeader>
        <CardTitle id="first-touch-title" className="flex items-center gap-1.5">
          <Send className="size-3.5" aria-hidden />
          First message
        </CardTitle>
        {status === "sent" && (
          <Badge tone="success" dot>
            Sent
          </Badge>
        )}
      </CardHeader>
      <CardBody>
        {!run ? (
          <div className="space-y-3">
            <p className="text-[14px] text-muted">
              A personal message to {contact.name}, written from the
              conversation, your notes and the card. You check it before it goes
              out.
            </p>
            <Button
              loading={actions.request.isPending}
              onClick={() => write(false)}
            >
              <Sparkles aria-hidden />
              Write first message
            </Button>
          </div>
        ) : status === "requested" || status === "drafting" ? (
          <Waiting
            title="Writing a personal message…"
            detail={`Asked ${formatRelative(run.created_at)}. This page updates by itself.`}
          >
            {canWrite && (
              <Button
                variant="ghost"
                size="sm"
                loading={actions.cancel.isPending}
                onClick={() => actions.cancel.mutate(run.id)}
              >
                Cancel
              </Button>
            )}
          </Waiting>
        ) : status === "draft_ready" ||
          (status === "failed" && run.drafted_at) ? (
          <div className="space-y-4">
            {status === "failed" && (
              <InlineAlert>
                <span className="font-medium">Sending failed.</span>{" "}
                {run.error ?? "No reason was given."}
                {canWrite && " Approve it again, or send it yourself."}
              </InlineAlert>
            )}
            {canWrite ? (
              <DraftEditor
                key={`${run.id}-${run.updated_at}`}
                run={run}
                contact={contact}
                actions={actions}
              />
            ) : (
              <p className="whitespace-pre-line text-[14px]">
                {run.whatsapp_text ?? run.email_body}
              </p>
            )}
          </div>
        ) : status === "failed" ? (
          <div className="space-y-3">
            <InlineAlert>
              <span className="font-medium">
                Couldn&apos;t write the message.
              </span>{" "}
              {run.error ?? "No reason was given."}
            </InlineAlert>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  loading={actions.retry.isPending}
                  onClick={() => actions.retry.mutate(run.id)}
                >
                  <RefreshCw aria-hidden />
                  Try again
                </Button>
                <Button
                  variant="ghost"
                  loading={actions.cancel.isPending}
                  onClick={() => actions.cancel.mutate(run.id)}
                >
                  Discard
                </Button>
              </div>
            )}
          </div>
        ) : status === "approved" || status === "sending" ? (
          <Waiting
            title={
              stuck ? "Sending hasn't been confirmed" : `Sending on ${sentOn}…`
            }
            detail={
              stuck
                ? `Check ${sentOn} first: if it didn't arrive, send it again.`
                : `Approved ${formatRelative(run.approved_at ?? run.updated_at)}. This page updates by itself.`
            }
          >
            <p className="whitespace-pre-line rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[14px]">
              {run.channel === "email" ? run.email_body : run.whatsapp_text}
            </p>
            {canWrite && (status === "approved" || stuck) && (
              <div className="flex flex-wrap gap-2">
                {stuck && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={actions.retry.isPending}
                    onClick={() => actions.retry.mutate(run.id)}
                  >
                    <RefreshCw aria-hidden />
                    Send again
                  </Button>
                )}
                {status === "approved" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={actions.cancel.isPending}
                    onClick={() => actions.cancel.mutate(run.id)}
                  >
                    Don&apos;t send
                  </Button>
                )}
              </div>
            )}
          </Waiting>
        ) : status === "sent" ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[14px]">
              <CheckCircle2
                className="size-4 shrink-0 text-success"
                aria-hidden
              />
              Sent on {sentOn} {formatRelative(run.sent_at ?? run.updated_at)}
              {run.send_mode === "manual" ? " (by hand)" : ""}. It&apos;s in the
              conversation below.
            </p>
            {canWrite && !closed && (
              <Button
                variant="ghost"
                size="sm"
                loading={actions.request.isPending}
                onClick={() => write(true)}
              >
                <Sparkles aria-hidden />
                Write another
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[14px] text-muted">
              The first message was discarded.
            </p>
            {canWrite && !closed && (
              <Button
                variant="secondary"
                loading={actions.request.isPending}
                onClick={() => write(true)}
              >
                <Sparkles aria-hidden />
                Write a new one
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
