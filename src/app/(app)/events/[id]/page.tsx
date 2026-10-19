import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EventDetail } from "@/components/app/event-detail";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Exhibition" };

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <RequirePermission permission="events:read" what="exhibitions">
      <EventDetail id={id} />
    </RequirePermission>
  );
}
