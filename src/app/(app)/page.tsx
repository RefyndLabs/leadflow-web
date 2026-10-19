import type { Metadata } from "next";
import { Dashboard } from "@/components/app/dashboard";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return <Dashboard />;
}
