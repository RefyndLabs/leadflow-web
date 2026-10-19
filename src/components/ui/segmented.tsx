"use client";

import * as React from "react";
import { RadioGroup as R } from "radix-ui";
import { cn } from "@/lib/utils";

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: React.ReactNode;
}

/** iOS-style segmented control built on a radio group (arrow keys, one tab stop, announced as radios). */
export function Segmented<V extends string>({
  value,
  onValueChange,
  options,
  label,
  disabled,
  className,
}: {
  value: V | null | undefined;
  onValueChange: (v: V) => void;
  options: readonly SegmentOption<V>[];
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <R.Root
      value={value ?? ""}
      onValueChange={(v) => onValueChange(v as V)}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "inline-flex w-full rounded-[10px] bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <R.Item
          key={o.value}
          value={o.value}
          className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[14px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50 data-[state=checked]:bg-surface data-[state=checked]:text-foreground data-[state=checked]:shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(0_0_0/0.08)] sm:h-8"
        >
          {o.icon}
          <span className="truncate">{o.label}</span>
        </R.Item>
      ))}
    </R.Root>
  );
}
