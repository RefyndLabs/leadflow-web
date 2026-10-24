"use client";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { InlineAlert } from "@/components/ui/feedback";

/** A temporary password, shown exactly once: copy it, hand it over, close. */
export function ShownOnce({
  open,
  title,
  email,
  secret,
  onClose,
}: {
  open: boolean;
  title: string;
  email: string;
  secret: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={email}>
        <div className="space-y-3 px-5 pb-5 pt-3 text-[14px]">
          <InlineAlert tone="warning">
            This temporary password is shown only now. Give it to the person
            privately (not in a group chat). They must choose their own at their
            first sign-in.
          </InlineAlert>
          <div className="flex items-center justify-between gap-2 rounded-[10px] bg-surface-2 p-3">
            <code className="break-all font-mono text-[15px]">{secret}</code>
            <CopyButton value={secret} />
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Done</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
