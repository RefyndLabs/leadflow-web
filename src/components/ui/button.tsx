import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const button = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-[15px] font-medium transition-[background-color,opacity,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:opacity-90",
        secondary: "bg-surface-2 text-foreground hover:bg-line",
        outline:
          "border border-line-strong bg-surface text-foreground hover:bg-surface-2",
        ghost: "text-foreground hover:bg-surface-2",
        tint: "bg-accent-soft text-accent hover:bg-accent/15",
        danger: "bg-danger text-accent-fg hover:opacity-90",
        "danger-tint": "bg-danger-soft text-danger hover:bg-danger/20",
        link: "h-auto rounded-none p-0 text-accent hover:underline",
      },
      size: {
        // 44px on touch screens (HIG default), 36px with a pointer.
        md: "h-11 px-4 sm:h-9 sm:px-3.5",
        sm: "h-9 px-3 text-sm sm:h-8 sm:px-3",
        lg: "h-12 px-5 text-base sm:h-11",
        icon: "size-11 sm:size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(button({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...(!asChild && { type: props.type ?? "button" })}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}
