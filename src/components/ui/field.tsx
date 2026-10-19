import * as React from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  /** Exactly one control. It receives id / aria-invalid / aria-describedby. */
  children: React.ReactElement<Record<string, unknown>>;
}

/** Label + control + hint + inline error, wired together for screen readers. */
export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
}: FieldProps) {
  const uid = React.useId();
  const id = (children.props.id as string | undefined) ?? `f-${uid}`;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy =
    [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-foreground"
      >
        {label}
        {required ? (
          <span className="ml-0.5 text-muted" aria-hidden>
            *
          </span>
        ) : (
          <span className="sr-only"> (optional)</span>
        )}
      </label>
      {React.cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Group of related fields with a heading, used to keep long forms scannable. */
export function FieldGroup({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      {title && (
        <legend className="mb-1 w-full">
          <span className="block text-[13px] font-semibold uppercase tracking-wide text-muted">
            {title}
          </span>
          {description && (
            <span className="mt-0.5 block text-[13px] font-normal normal-case tracking-normal text-muted">
              {description}
            </span>
          )}
        </legend>
      )}
      {children}
    </fieldset>
  );
}
