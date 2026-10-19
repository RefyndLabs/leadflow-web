import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccountDetail } from "@/components/app/accounts";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Company" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <RequirePermission permission="accounts:read" what="companies">
      <AccountDetail id={id} />
    </RequirePermission>
  );
}
