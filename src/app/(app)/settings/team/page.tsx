import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamList } from "@/components/app/team";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Team" };

export default function Page() {
  return (
    <RequirePermission permission="users:read" what="team management">
      <Suspense>
        <TeamList />
      </Suspense>
    </RequirePermission>
  );
}
