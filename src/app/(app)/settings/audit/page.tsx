import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditLog } from "@/components/app/audit";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return (
    <RequirePermission permission="audit:read" what="the audit log">
      <Suspense>
        <AuditLog />
      </Suspense>
    </RequirePermission>
  );
}
