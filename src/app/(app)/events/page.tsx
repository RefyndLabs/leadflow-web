import type { Metadata } from "next";
import { Suspense } from "react";
import { EventsList } from "@/components/app/events";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Exhibitions" };

export default function Page() {
  return (
    <RequirePermission permission="events:read" what="exhibitions">
      <Suspense>
        <EventsList />
      </Suspense>
    </RequirePermission>
  );
}
