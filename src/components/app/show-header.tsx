import { Building2, CalendarDays, MapPin } from "lucide-react";
import type { EventBrief } from "@/lib/api/types";
import { countryName } from "@/lib/countries";
import { countryFlag, formatDateRange } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Which show this capture is from: name, our stand, dates and place. Shown on the booth and review screens. */
export function ShowHeader({
  event,
  className,
}: {
  event: EventBrief | null | undefined;
  className?: string;
}) {
  if (!event)
    return (
      <div className={cn("rounded-[12px] bg-surface-2 px-4 py-3 text-[14px] text-muted", className)}>
        Not at a show (office / factory visit)
      </div>
    );
  const place = [event.location, event.country ? countryName(event.country) : null].filter(Boolean).join(", ");
  return (
    <div className={cn("rounded-[12px] border border-accent/30 bg-accent-soft/50 px-4 py-3", className)}>
      <p className="text-[16px] font-semibold leading-snug">{event.name}</p>
      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        {event.booth && (
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <Building2 className="size-3.5" aria-hidden />
            Stand {event.booth}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3.5" aria-hidden />
          {formatDateRange(event.date, event.end_date)}
        </span>
        {place && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {event.country && <span aria-hidden>{countryFlag(event.country)}</span>}
            {place}
          </span>
        )}
      </p>
    </div>
  );
}
