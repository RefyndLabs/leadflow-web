import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactsList } from "@/components/app/contacts";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
  return (
    <RequirePermission permission="contacts:read" what="contacts">
      <Suspense>
        <ContactsList />
      </Suspense>
    </RequirePermission>
  );
}
