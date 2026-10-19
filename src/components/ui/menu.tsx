"use client";

import * as React from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        align="end"
        className={cn(
          "z-50 min-w-48 animate-pop rounded-[12px] bg-surface p-1 shadow-[var(--shadow-float)]",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function MenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof M.Item> & { destructive?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex min-h-10 cursor-default select-none items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[14px] outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-accent-soft [&_svg]:size-4 [&_svg]:text-muted",
        destructive &&
          "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof M.Label>) {
  return (
    <M.Label
      className={cn("px-2.5 py-1.5 text-xs font-medium text-muted", className)}
      {...props}
    />
  );
}

export const MenuSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof M.Separator>) => (
  <M.Separator className={cn("my-1 h-px bg-line", className)} {...props} />
);
