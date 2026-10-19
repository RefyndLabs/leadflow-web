import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/app/login-form";
import { safeNext } from "@/lib/next-url";
import { openSession, sessionCookieName } from "@/lib/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);

  // Already signed in (cookie decrypts) → straight to the app. A stale token is caught by the first API call.
  const jar = await cookies();
  if (await openSession(jar.get(sessionCookieName())?.value)) redirect(next);

  const notice =
    sp.reason === "expired"
      ? "Your session ended. Sign in to pick up where you left off."
      : sp.reason === "signed-out"
        ? "You've been signed out."
        : null;

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-[14px] bg-accent text-accent-fg">
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 6h10M4 12h16M4 18h7" />
            </svg>
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight">
            Sign in to Leadflow
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            Use the email your admin set up for you.
          </p>
        </div>
        <LoginForm next={next} notice={notice} />
      </div>
    </main>
  );
}
