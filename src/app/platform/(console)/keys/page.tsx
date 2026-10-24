import type { Metadata } from "next";
import { PlatformKeys } from "@/components/platform/keys";

export const metadata: Metadata = { title: "Automation keys" };

export default function Page() {
  return <PlatformKeys />;
}
