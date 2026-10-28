import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailSettings } from "@/components/app/email-settings";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Email" };

export default function Page() {
  return (
    <RequirePermission permission="org:read" what="email settings">
      <Suspense>
        <EmailSettings />
      </Suspense>
    </RequirePermission>
  );
}
