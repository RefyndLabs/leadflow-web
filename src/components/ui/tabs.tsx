"use client";

import * as React from "react";
import { Tabs as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "relative -mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-[14px] font-medium text-muted transition-colors hover:text-foreground data-[state=active]:border-accent data-[state=active]:text-foreground sm:h-10",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof T.Content>) {
  return (
    <T.Content className={cn("pt-4 outline-none", className)} {...props} />
  );
}
