import type { Metadata } from "next";
import { ApiKeys } from "@/components/app/api-keys";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "API keys" };

export default function Page() {
  return (
    <RequirePermission permission="keys:manage" what="API keys">
      <ApiKeys />
    </RequirePermission>
  );
}
