import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CaptureReview } from "@/components/app/capture-review";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Check capture" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <RequirePermission permission="captures:read" what="captures">
      <CaptureReview id={id} />
    </RequirePermission>
  );
}
