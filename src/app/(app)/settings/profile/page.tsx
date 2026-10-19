import type { Metadata } from "next";
import { Profile } from "@/components/app/profile";

export const metadata: Metadata = { title: "Profile & security" };

export default function Page() {
  return <Profile />;
}
