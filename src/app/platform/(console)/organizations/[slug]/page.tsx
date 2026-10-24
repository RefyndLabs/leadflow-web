import type { Metadata } from "next";
import { PlatformOrganization } from "@/components/platform/organization";

export const metadata: Metadata = { title: "Organization" };

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PlatformOrganization slug={slug} />;
}
