import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountsList } from "@/components/app/accounts";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Companies" };

export default function Page() {
  return (
    <RequirePermission permission="accounts:read" what="companies">
      <Suspense>
        <AccountsList />
      </Suspense>
    </RequirePermission>
  );
}
