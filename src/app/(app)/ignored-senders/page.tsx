import type { Metadata } from "next";
import { IgnoredSenders } from "@/components/app/ignored-senders";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Ignored senders" };

export default function Page() {
  return (
    <RequirePermission permission="leads:read" what="ignored senders">
      <IgnoredSenders />
    </RequirePermission>
  );
}
