import type { Metadata } from "next";
import { FollowUps } from "@/components/app/follow-ups";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Follow-ups" };

export default function Page() {
  return (
    <RequirePermission permission="cadences:read" what="follow-ups">
      <FollowUps />
    </RequirePermission>
  );
}
