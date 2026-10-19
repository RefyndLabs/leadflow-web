import { Loader2 } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { CAPTURE_LABEL } from "@/lib/enums";
import type { CaptureStatus } from "@/lib/api/types";

const TONE: Record<CaptureStatus, Tone> = {
  draft: "neutral",
  submitted: "neutral",
  processing: "neutral",
  ready_for_review: "accent",
  failed: "warning",
  confirmed: "success",
  discarded: "neutral",
};

export function CaptureBadge({ status }: { status: CaptureStatus }) {
  const reading = status === "submitted" || status === "processing";
  return (
    <Badge tone={TONE[status]} dot={!reading}>
      {reading && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {CAPTURE_LABEL[status]}
    </Badge>
  );
}
