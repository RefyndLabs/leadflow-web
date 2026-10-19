import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ContactDetail } from "@/components/app/contacts";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Contact" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <RequirePermission permission="contacts:read" what="contacts">
      <ContactDetail id={id} />
    </RequirePermission>
  );
}
