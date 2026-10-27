import type { Metadata } from "next";
import { PlatformSettings } from "@/components/platform/settings";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <PlatformSettings />;
}
