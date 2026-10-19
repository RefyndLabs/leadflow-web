import type { Metadata } from "next";
import { Suspense } from "react";
import { Catalog } from "@/components/app/catalog";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Catalog" };

export default function Page() {
  return (
    <RequirePermission permission="catalog:read" what="the catalog">
      <Suspense>
        <Catalog />
      </Suspense>
    </RequirePermission>
  );
}
