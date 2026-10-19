import { Paperclip } from "lucide-react";
import { safeHttpUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * `raw_source_ref` is a free string kept for channels that link to an external original (email, partner
 * feeds). http(s) links open in a new tab; anything else is shown as inert text. Photos and voice notes from
 * "Capture at a show" are real attachments and render through <MessageAttachments> instead.
 */
export function AttachmentLink({
  reference,
  tone = "default",
}: {
  reference: string;
  tone?: "default" | "onAccent";
}) {
  const parts = reference.split(/\s+/).filter(Boolean);
  return (
    <span className="flex flex-col items-start gap-1">
      {parts.map((p) => {
        const url = safeHttpUrl(p);
        return url ? (
          <a
            key={p}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 underline underline-offset-2",
              tone === "onAccent" ? "text-accent-fg" : "text-accent",
            )}
          >
            <Paperclip className="size-3.5" aria-hidden />
            Open original
          </a>
        ) : (
          <span key={p} className="break-all">
            {p}
          </span>
        );
      })}
    </span>
  );
}
