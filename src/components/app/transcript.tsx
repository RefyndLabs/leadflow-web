"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { Capture, ExtractionResult } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { AudioPlayer, attachmentSrc } from "./attachments";
import { CardPhotos } from "./card-photos";

export function Disclosure({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-[12px] border border-line bg-surface" open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="whitespace-pre-wrap break-words border-t border-line px-3.5 py-3 text-[14px] text-muted">
        {children}
      </div>
    </details>
  );
}

const isEnglish = (lang: string | null | undefined) => !lang || /^en\b|^english/i.test(lang);

/** Verbatim transcript (original language), the English translation, local terms and the card text (front and back). */
export function TranscriptPanels({ x }: { x: ExtractionResult | null | undefined }) {
  if (!x) return null;
  const glossary = Object.entries(x.conversation?.glossary ?? {});
  const translated = x.transcript_english && (!isEnglish(x.transcript_language) || x.transcript_english !== x.transcript);
  return (
    <>
      {x.transcript && (
        <Disclosure title={`What was said${x.transcript_language ? ` (${x.transcript_language})` : ""}`}>
          {x.transcript}
        </Disclosure>
      )}
      {translated && <Disclosure title="In English">{x.transcript_english}</Disclosure>}
      {glossary.length > 0 && (
        <Disclosure title="Local terms">
          <ul className="space-y-0.5 whitespace-normal">
            {glossary.map(([k, v]) => (
              <li key={k}>
                <span className="font-medium text-foreground">{k}</span> = {v}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {x.card_text && (
        <Disclosure title={x.card_back_text ? "Text read from the front of the card" : "Text read from the card"}>
          {x.card_text}
        </Disclosure>
      )}
      {x.card_back_text && <Disclosure title="Text read from the back of the card">{x.card_back_text}</Disclosure>}
    </>
  );
}

/** Lead page section 8: the show capture that created this lead. */
export function FromTheShow({ capture }: { capture: Capture }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>From the show</CardTitle>
        <span className="text-[13px] text-muted">
          {capture.created_by?.name ? `${capture.created_by.name} · ` : ""}
          {formatRelative(capture.created_at)}
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        <CardPhotos front={capture.card} back={capture.card_back} className="h-56 w-full" />
        {capture.voice && <AudioPlayer src={attachmentSrc(capture.voice.id)} label="Recording from the show" />}
        {capture.note && (
          <p className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[14px]">
            <span className="text-muted">Note: </span>
            {capture.note}
          </p>
        )}
        <TranscriptPanels x={capture.extracted} />
      </CardBody>
    </Card>
  );
}
