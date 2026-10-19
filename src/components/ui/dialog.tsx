"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One modal, two presentations: a bottom sheet on phones (swipe-free, always has a visible
 * Close button as well as Esc/backdrop) and a centred dialog from `sm` up. One modal at a time.
 */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  title,
  description,
  children,
  hideClose,
  ...props
}: React.ComponentProps<typeof D.Content> & {
  title: string;
  description?: string;
  hideClose?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 animate-fade-in" />
      <D.Content
        className={cn(
          "fixed z-50 flex max-h-[92dvh] flex-col bg-surface shadow-[var(--shadow-float)] outline-none",
          "inset-x-0 bottom-0 animate-sheet-up rounded-t-[20px] pb-safe",
          "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-pop sm:rounded-[16px] sm:pb-0",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-3 pt-4">
          <div className="min-w-0">
            <D.Title className="text-[17px] font-semibold leading-snug">
              {title}
            </D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-[13px] text-muted">
                {description}
              </D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          {!hideClose && (
            <D.Close
              aria-label="Close"
              className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground sm:size-9"
            >
              <X className="size-5" aria-hidden />
            </D.Close>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:sm:min-w-24",
        className,
      )}
      {...props}
    />
  );
}
