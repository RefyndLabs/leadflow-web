import { Check, X } from "lucide-react";
import type { LeadStatus } from "@/lib/api/types";
import { STATUS_LABEL } from "@/lib/enums";
import { PIPELINE, railIndex } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * The product's signature element: where a lead sits on its way from first contact to a
 * closed deal. `stale` and `lost` are side branches, so they replace the label of the step
 * they hang off instead of adding a fifth stop. Every step has a text label and an icon or
 * number — state is never colour alone.
 */
export function PipelineRail({ status }: { status: LeadStatus }) {
  const current = railIndex(status);
  const closedLost = status === "lost";
  const stale = status === "stale";
  const done = status === "won";

  const steps = PIPELINE.map((s, i) => {
    let label = STATUS_LABEL[s];
    let tone: "done" | "current" | "todo" | "warning" | "danger" =
      i < current ? "done" : i === current ? "current" : "todo";
    if (i === 1 && stale) {
      label = STATUS_LABEL.stale;
      tone = "warning";
    }
    if (i === 2 && closedLost) {
      label = STATUS_LABEL.lost;
      tone = "danger";
    }
    if (done) tone = "done";
    if (s === "quotation_requested" && !closedLost) label = "Quotation";
    return { key: s, label, tone };
  });

  return (
    <ol aria-label="Lead progress" className="flex items-start">
      {steps.map((s, i) => (
        <li
          key={s.key}
          aria-current={
            s.tone === "current" || s.tone === "warning" || s.tone === "danger"
              ? "step"
              : undefined
          }
          className="relative flex min-w-0 flex-1 flex-col items-center text-center"
        >
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute left-[-50%] right-[50%] top-[13px] h-0.5 rounded-full",
                i <= current || done
                  ? closedLost && i === 3
                    ? "bg-line"
                    : "bg-accent"
                  : "bg-line",
              )}
            />
          )}
          <span
            className={cn(
              "relative z-10 grid size-7 place-items-center rounded-full border-2 text-[12px] font-semibold",
              s.tone === "done" && "border-accent bg-accent text-accent-fg",
              s.tone === "current" && "border-accent bg-surface text-accent",
              s.tone === "todo" && "border-line-strong bg-surface text-muted",
              s.tone === "warning" &&
                "border-warning bg-warning-soft text-warning",
              s.tone === "danger" && "border-danger bg-danger-soft text-danger",
            )}
          >
            {s.tone === "done" ? (
              <Check className="size-4" strokeWidth={3} aria-hidden />
            ) : s.tone === "danger" ? (
              <X className="size-4" strokeWidth={3} aria-hidden />
            ) : (
              i + 1
            )}
          </span>
          <span
            className={cn(
              "mt-1.5 px-0.5 text-[12px] font-medium leading-tight",
              s.tone === "todo" ? "text-muted" : "text-foreground",
              s.tone === "warning" && "text-warning",
              s.tone === "danger" && "text-danger",
            )}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
