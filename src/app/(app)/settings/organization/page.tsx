import type { Metadata } from "next";
import { OrganizationSettings } from "@/components/app/organization";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Organization" };

export default function Page() {
  return (
    <RequirePermission permission="org:read" what="organization settings">
      <OrganizationSettings />
    </RequirePermission>
  );
}
