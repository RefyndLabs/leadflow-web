import type { Metadata } from "next";
import { Suspense } from "react";
import { CapturesQueue } from "@/components/app/captures";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Captures" };

export default function Page() {
  return (
    <RequirePermission permission="captures:read" what="captures">
      <Suspense>
        <CapturesQueue />
      </Suspense>
    </RequirePermission>
  );
}
