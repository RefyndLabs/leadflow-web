import { Flame, Snowflake, Sun } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { QUALITY_LABEL, STATUS_LABEL } from "@/lib/enums";
import type { LeadQualityTag, LeadStatus } from "@/lib/api/types";

const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: "neutral",
  uncontacted: "neutral",
  in_conversation: "accent",
  quotation_requested: "accent",
  stale: "warning",
  won: "success",
  lost: "danger",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const QUALITY: Record<LeadQualityTag, { tone: Tone; icon: typeof Flame }> = {
  hot: { tone: "danger", icon: Flame },
  warm: { tone: "warning", icon: Sun },
  cold: { tone: "accent", icon: Snowflake },
};

export function QualityBadge({
  tag,
}: {
  tag: LeadQualityTag | null | undefined;
}) {
  if (!tag) return <span className="text-[13px] text-muted">Not rated</span>;
  const { tone, icon: Icon } = QUALITY[tag];
  return (
    <Badge tone={tone}>
      <Icon className="size-3" aria-hidden />
      {QUALITY_LABEL[tag]}
    </Badge>
  );
}
