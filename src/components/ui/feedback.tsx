import * as React from "react";
import { AlertTriangle, Loader2, type LucideIcon } from "lucide-react";
import { ApiError, describeError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[8px] bg-surface-2", className)}
      {...props}
    />
  );
}

export function Spinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-2 text-muted", className)}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Placeholder rows while a list loads: something appears immediately (HIG › Loading). */
export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Empty states invite the next action instead of just saying "nothing here". */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 grid size-12 place-items-center rounded-full bg-surface-2 text-muted">
          <Icon className="size-6" aria-hidden />
        </div>
      )}
      <h3 className="text-[16px] font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-[14px] text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error state with a way forward. 403 reads as "no access", not as a failure. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const notFound = error instanceof ApiError && error.status === 404;
  const requestId = error instanceof ApiError ? error.requestId : null;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-3 grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h3 className="text-[16px] font-semibold">
        {forbidden
          ? "You don't have access to this"
          : notFound
            ? "Not found"
            : "Couldn't load this"}
      </h3>
      <p className="mt-1 max-w-sm text-[14px] text-muted">
        {describeError(error)}
      </p>
      {requestId && !describeError(error).includes(requestId) && (
        <p className="mt-1 font-mono text-xs text-muted">ref {requestId}</p>
      )}
      {onRetry && !forbidden && !notFound && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Inline banner for form-level problems (409 conflicts, network errors). */
export function InlineAlert({
  tone = "danger",
  children,
  className,
}: {
  tone?: "danger" | "warning" | "accent" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
  } as const;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-[10px] px-3.5 py-2.5 text-[14px]",
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
