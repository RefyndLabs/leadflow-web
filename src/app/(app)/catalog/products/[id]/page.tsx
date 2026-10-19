import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProductDetail } from "@/components/app/product-detail";
import { RequirePermission } from "@/components/app/access";

export const metadata: Metadata = { title: "Product" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <RequirePermission permission="catalog:read" what="the catalog">
      <ProductDetail id={id} />
    </RequirePermission>
  );
}
