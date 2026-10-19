"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Paperclip } from "lucide-react";
import { useLogTouchpoint } from "@/lib/api/hooks";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import type { Touchpoint } from "@/lib/api/types";
import { DIRECTION_LABEL, TOUCHPOINT_CHANNELS, channelLabel } from "@/lib/enums";
import { formatDate, formatTime } from "@/lib/format";
import { applyApiError, useFormBanner, useZodForm } from "@/lib/forms";
import { touchpointCreate } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, InlineAlert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "sonner";
import { AttachmentLink } from "./attachment-link";
import { MessageAttachments } from "./attachments";
import { Controller } from "react-hook-form";

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function Bubble({
  tp,
  imageLabels,
}: {
  tp: Touchpoint;
  imageLabels?: Record<string, string>;
}) {
  const out = tp.direction === "outbound";
  return (
    <li className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] sm:max-w-[75%]", out && "text-right")}>
        <div
          className={cn(
            "inline-block whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2.5 text-left text-[15px] leading-relaxed",
            out
              ? "rounded-br-[6px] bg-accent text-accent-fg"
              : "rounded-bl-[6px] bg-surface-2 text-foreground",
          )}
        >
          {tp.content ? (
            tp.content
          ) : tp.attachments?.length ? null : (
            <span className="italic">No message text</span>
          )}
          <MessageAttachments
            attachments={tp.attachments}
            labels={imageLabels}
            tone={out ? "onAccent" : "default"}
          />
          {tp.raw_source_ref && (
            <div
              className={cn(
                "mt-2 border-t pt-2 text-[13px]",
                out ? "border-accent-fg/30" : "border-line",
              )}
            >
              <AttachmentLink
                reference={tp.raw_source_ref}
                tone={out ? "onAccent" : "default"}
              />
            </div>
          )}
        </div>
        <p
          className="mt-1 flex items-center gap-1 px-1 text-[12px] text-muted"
          style={{ justifyContent: out ? "flex-end" : "flex-start" }}
        >
          {out ? (
            <ArrowUpRight className="size-3" aria-hidden />
          ) : (
            <ArrowDownLeft className="size-3" aria-hidden />
          )}
          <span className="sr-only">{DIRECTION_LABEL[tp.direction]}, </span>
          {channelLabel(tp.channel)} ·{" "}
          <time dateTime={tp.created_at}>{formatTime(tp.created_at)}</time>
          {tp.approved_at && <span> · approved</span>}
        </p>
      </div>
    </li>
  );
}

export function Thread({
  touchpoints,
  imageLabels,
}: {
  touchpoints: Touchpoint[];
  /** Names for known photos by attachment id, e.g. the front / back of a business card. */
  imageLabels?: Record<string, string>;
}) {
  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [touchpoints.length]);

  if (touchpoints.length === 0) {
    return (
      <EmptyState
        icon={Paperclip}
        title="No messages yet"
        description="Messages and calls logged on this lead appear here in order, oldest first."
        className="py-10"
      />
    );
  }

  const rows = touchpoints.map((tp, i) => ({
    tp,
    header:
      i === 0 ||
      dayKey(tp.created_at) !== dayKey(touchpoints[i - 1]!.created_at),
  }));
  return (
    <div>
      <ol className="space-y-3" aria-label="Conversation, oldest first">
        {rows.map(({ tp, header }) => {
          return (
            <React.Fragment key={tp.id}>
              {header && (
                <li
                  className="py-1 text-center text-[12px] font-medium text-muted"
                  aria-hidden
                >
                  {formatDate(tp.created_at)}
                </li>
              )}
              <Bubble tp={tp} imageLabels={imageLabels} />
            </React.Fragment>
          );
        })}
      </ol>
      <div ref={endRef} />
    </div>
  );
}

export function TouchpointComposer({
  leadId,
  defaultChannel,
}: {
  leadId: string;
  defaultChannel?: string;
}) {
  const form = useZodForm(touchpointCreate, {
    direction: "outbound",
    channel: (defaultChannel ?? "whatsapp") as never,
    content: "",
    raw_source_ref: "",
  });
  const { banner, setBanner, clear } = useFormBanner();
  const idem = useIdempotencyKey(); // one key per logical submission; reused if the same one is retried
  const log = useLogTouchpoint(leadId, { handled: true });

  const submit = form.handleSubmit(async (values) => {
    clear();
    try {
      const payload = {
        direction: values.direction,
        channel: values.channel,
        ...(values.content ? { content: values.content } : {}),
      };
      await log.mutateAsync({ body: payload, key: idem.get() });
      idem.reset();
      form.reset({
        direction: values.direction,
        channel: values.channel,
        content: "",
        raw_source_ref: "",
      });
      toast.success("Logged");
    } catch (e) {
      setBanner(applyApiError(form as never, e));
    }
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => void submit(e);
  const { errors } = form.formState;
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-3 rounded-[14px] border border-line bg-surface p-4"
    >
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
        Log a message or call
      </h3>
      {banner && <InlineAlert>{banner}</InlineAlert>}
      <div className="grid gap-3 xl:grid-cols-2">
        <Controller
          control={form.control}
          name="direction"
          render={({ field }) => (
            <Segmented
              label="Direction"
              value={field.value as "inbound" | "outbound"}
              onValueChange={field.onChange}
              options={[
                {
                  value: "outbound",
                  label: "We sent",
                  icon: <ArrowUpRight className="size-4" aria-hidden />,
                },
                {
                  value: "inbound",
                  label: "They sent",
                  icon: <ArrowDownLeft className="size-4" aria-hidden />,
                },
              ]}
            />
          )}
        />
        <Field
          label="Channel"
          required
          error={errors.channel?.message as string | undefined}
          className="[&>label]:sr-only"
        >
          <Select {...form.register("channel")}>
            {TOUCHPOINT_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {channelLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="What was said"
        error={errors.content?.message as string | undefined}
        className="[&>label]:sr-only"
      >
        <Textarea
          rows={3}
          placeholder="What was said or agreed…"
          maxLength={20000}
          {...form.register("content")}
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          An outbound message on an uncontacted lead moves it to In
          conversation; a reply on a stale lead does too.
        </p>
        <Button type="submit" loading={log.isPending}>
          Log it
        </Button>
      </div>
    </form>
  );
}
