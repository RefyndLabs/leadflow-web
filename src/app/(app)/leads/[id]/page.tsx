import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LeadDetail } from "@/components/app/lead-detail";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <RequirePermission permission="leads:read" what="leads">
      <LeadDetail id={id} />
    </RequirePermission>
  );
}
