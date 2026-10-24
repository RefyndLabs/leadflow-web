import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PlatformLogin } from "@/components/platform/login";

export const metadata: Metadata = { title: "Platform sign-in" };

export default async function PlatformLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sp = await searchParams;
  const notice =
    sp.reason === "expired"
      ? "Your session ended. Sign in again."
      : sp.reason === "signed-out"
        ? "You've been signed out."
        : null;

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-[14px] bg-foreground text-surface">
            <ShieldCheck className="size-6" aria-hidden />
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight">
            Leadflow Platform
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            For the people who run Leadflow. Company users sign in at{" "}
            <a href="/login" className="text-accent hover:underline">
              /login
            </a>
            .
          </p>
        </div>
        <PlatformLogin notice={notice} />
      </div>
    </main>
  );
}
