import type { Metadata } from "next";
import { PlatformAdmins } from "@/components/platform/admins";

export const metadata: Metadata = { title: "Platform admins" };

export default function Page() {
  return <PlatformAdmins />;
}
