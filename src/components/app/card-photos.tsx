"use client";

import * as React from "react";
import type { Attachment, Capture } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { ZoomableImage, attachmentSrc } from "./attachments";

type Side = "front" | "back";

const SIDE_LABEL: Record<Side, string> = {
  front: "Front of card",
  back: "Back of card",
};

/**
 * Names for a capture's card photos when they show up as plain message attachments (attachments don't
 * say which side they are). Only two-sided cards are labelled; a lone front stays a plain "Photo".
 */
export function cardSideLabels(
  captures: readonly Pick<Capture, "card" | "card_back">[] | null | undefined,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const c of captures ?? []) {
    if (!c.card_back) continue;
    if (c.card) labels[c.card.id] = SIDE_LABEL.front;
    labels[c.card_back.id] = SIDE_LABEL.back;
  }
  return labels;
}

/**
 * The business card photo(s) of a capture: the front and the optional back, both zoomable. Two sides sit
 * side by side; on a phone a Front / Back switch shows one at a time. A lone front looks as it always did.
 */
export function CardPhotos({
  front,
  back,
  className,
}: {
  front: Attachment | null | undefined;
  back: Attachment | null | undefined;
  /** Size of a lone photo. */
  className: string;
}) {
  const [shown, setShown] = React.useState<Side>("front");
  if (!front && !back) return null;
  if (front && !back) {
    return (
      <ZoomableImage
        src={attachmentSrc(front.id)}
        alt="Business card"
        title="Business card"
        className={className}
      />
    );
  }
  if (!front && back) {
    return (
      <figure className="space-y-1.5">
        <ZoomableImage
          src={attachmentSrc(back.id)}
          alt="Business card — back"
          title={SIDE_LABEL.back}
          className={className}
        />
        <figcaption className="text-[13px] text-muted">{SIDE_LABEL.back}</figcaption>
      </figure>
    );
  }

  const sides: [Side, Attachment][] = [
    ["front", front!],
    ["back", back!],
  ];
  return (
    <div className="space-y-2">
      <Segmented<Side>
        label="Side of the card"
        value={shown}
        onValueChange={setShown}
        options={[
          { value: "front", label: "Front" },
          { value: "back", label: "Back" },
        ]}
        className="sm:hidden"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        {sides.map(([side, a]) => (
          <figure
            key={side}
            className={cn("min-w-0 space-y-1.5", side !== shown && "hidden sm:block")}
          >
            <ZoomableImage
              src={attachmentSrc(a.id)}
              alt={`Business card — ${side}`}
              title={SIDE_LABEL[side]}
              className="aspect-[3/2] h-auto w-full"
            />
            <figcaption className="text-[13px] text-muted">{SIDE_LABEL[side]}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
