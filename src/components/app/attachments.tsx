"use client";

import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Attachment } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Photos and recordings come through our own route (cookie auth, Range supported), never straight from the API. */
export const attachmentSrc = (id: string) => `/api/attachments/${id}`;

/** A photo that opens full size on tap. `src` may also be a blob: URL for a capture not yet uploaded. */
export function ZoomableImage({
  src,
  alt,
  className,
  title = "Photo",
}: {
  src: string;
  alt: string;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${alt} — open full size`}
        className={cn(
          "block overflow-hidden rounded-[12px] border border-line bg-surface-2",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="size-full object-cover"
        />
      </button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent title={title} className="sm:max-w-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="mx-auto max-h-[75dvh] w-auto max-w-full rounded-[10px] object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function AudioPlayer({
  src,
  label = "Voice note",
  className,
}: {
  src: string;
  label?: string;
  className?: string;
}) {
  // preload=metadata so duration shows without downloading the whole file; Range makes seeking work (Safari needs it).
  return (
    <audio
      controls
      preload="metadata"
      src={src}
      aria-label={label}
      className={cn("h-10 w-full", className)}
    />
  );
}

/**
 * Files attached to a lead message: photos as thumbnails that open full size, recordings as players.
 * A message may carry several photos (e.g. both sides of a business card); `labels` names known ones by id.
 */
export function MessageAttachments({
  attachments,
  labels,
  tone = "default",
}: {
  attachments: Attachment[] | null | undefined;
  labels?: Record<string, string>;
  tone?: "default" | "onAccent";
}) {
  if (!attachments?.length) return null;
  const images = attachments.filter((a) => a.kind === "image");
  const audio = attachments.filter((a) => a.kind === "audio");
  return (
    <div
      className={cn(
        "mt-2 space-y-2 border-t pt-2",
        tone === "onAccent" ? "border-accent-fg/30" : "border-line",
      )}
    >
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a, i) => {
            const label = labels?.[a.id];
            const photo = (
              <ZoomableImage
                key={a.id}
                src={attachmentSrc(a.id)}
                alt={label ?? (images.length > 1 ? `Photo ${i + 1}` : "Photo")}
                title={label}
                className="h-24 w-32"
              />
            );
            return label ? (
              <figure key={a.id} className="space-y-1">
                {photo}
                <figcaption
                  className={cn(
                    "text-[12px]",
                    tone === "onAccent" ? "text-accent-fg/80" : "text-muted",
                  )}
                >
                  {label}
                </figcaption>
              </figure>
            ) : (
              photo
            );
          })}
        </div>
      )}
      {audio.map((a, i) => (
        <AudioPlayer
          key={a.id}
          src={attachmentSrc(a.id)}
          label={audio.length > 1 ? `Voice note ${i + 1}` : "Voice note"}
          className="min-w-56"
        />
      ))}
    </div>
  );
}
