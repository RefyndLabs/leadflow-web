import type { Metadata } from "next";
import { PlatformOrganizations } from "@/components/platform/organizations";

export const metadata: Metadata = { title: "Organizations" };

export default function Page() {
  return <PlatformOrganizations />;
}
