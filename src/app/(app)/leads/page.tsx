import type { Metadata } from "next";
import { Suspense } from "react";
import { LeadsList } from "@/components/app/leads-list";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <RequirePermission permission="leads:read" what="leads">
      <Suspense>
        <LeadsList />
      </Suspense>
    </RequirePermission>
  );
}
