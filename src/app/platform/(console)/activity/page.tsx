import type { Metadata } from "next";
import { PlatformActivity } from "@/components/platform/activity";

export const metadata: Metadata = { title: "Activity log" };

export default function Page() {
  return <PlatformActivity />;
}
