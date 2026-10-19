import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCount } from "@/lib/format";
import { Button } from "./button";

export const PAGE_SIZE = 25;

/**
 * Works the same on every list: reads `X-Total-Count` when present, otherwise falls back
 * to "a full page means there may be more".
 */
export function Pagination({
  skip,
  limit = PAGE_SIZE,
  total,
  count,
  onChange,
  noun = "results",
}: {
  skip: number;
  limit?: number;
  total: number | null | undefined;
  count: number;
  onChange: (skip: number) => void;
  noun?: string;
}) {
  const hasPrev = skip > 0;
  const hasNext = total != null ? skip + count < total : count >= limit;
  if (!hasPrev && !hasNext) {
    return total != null && total > 0 ? (
      <p className="px-4 py-3 text-[13px] text-muted sm:px-5">
        {formatCount(total)} {total === 1 ? noun.replace(/s$/, "") : noun}
      </p>
    ) : null;
  }
  const from = count === 0 ? 0 : skip + 1;
  const to = skip + count;
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:px-5"
    >
      <p className="text-[13px] text-muted tabular">
        {formatCount(from)}–{formatCount(to)}
        {total != null && ` of ${formatCount(total)}`} {noun}
      </p>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasPrev}
          onClick={() => onChange(Math.max(0, skip - limit))}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden />
          Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasNext}
          onClick={() => onChange(skip + limit)}
          aria-label="Next page"
        >
          Next
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
