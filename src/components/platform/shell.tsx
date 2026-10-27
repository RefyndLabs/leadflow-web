"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, ShieldCheck } from "lucide-react";
import { ApiError, describeError } from "@/lib/api/errors";
import {
  platformApi,
  platformKeys,
  platformLocalPost,
  usePlatformMe,
} from "@/lib/api/platform";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, InlineAlert, Skeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/input";
import { FreshCodeField, useFreshCode } from "./fresh-code";

const NAV = [
  { href: "/platform", label: "Organizations" },
  { href: "/platform/admins", label: "Platform admins" },
  { href: "/platform/keys", label: "Automation keys" },
  { href: "/platform/activity", label: "Activity log" },
  { href: "/platform/settings", label: "Settings" },
] as const;

export const PLATFORM_ROLE_LABEL = { owner: "Owner", staff: "Staff" } as const;

function isActive(pathname: string, href: string) {
  if (href === "/platform")
    return (
      pathname === "/platform" || pathname.startsWith("/platform/organizations")
    );
  return pathname === href || pathname.startsWith(`${href}/`);
}

export async function platformSignOut() {
  try {
    await platformLocalPost("/api/platform/logout");
  } catch {
    /* the cookie is cleared regardless */
  }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/platform/login?reason=signed-out");
}

/**
 * Change the platform admin's own password (forced while it is a temporary
 * one). Needs a fresh authenticator code as well.
 */
export function PlatformChangePassword({ forced }: { forced?: boolean }) {
  const qc = useQueryClient();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const code = useFreshCode();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== again) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      await platformApi<void>("/auth/change-password", {
        method: "POST",
        body: { current_password: current, new_password: next, ...code.body() },
      });
      setCurrent("");
      setNext("");
      setAgain("");
      code.reset();
      toast.success("Password changed");
      await qc.invalidateQueries({ queryKey: platformKeys.me });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>
          {forced ? "Choose your own password" : "Change password"}
        </CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4">
          {forced && (
            <InlineAlert tone="accent">
              You signed in with a temporary password. Choose your own before
              using the console.
            </InlineAlert>
          )}
          {error && <InlineAlert>{error}</InlineAlert>}
          <Field
            label={forced ? "Temporary password" : "Current password"}
            required
          >
            <PasswordInput
              autoComplete="current-password"
              maxLength={128}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field
            label="New password"
            required
            hint="At least 12 characters, not a common password, and not containing your name or email."
          >
            <PasswordInput
              autoComplete="new-password"
              maxLength={128}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="New password again" required>
            <PasswordInput
              autoComplete="new-password"
              maxLength={128}
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </Field>
          <FreshCodeField state={code} />
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={busy}
              disabled={!current || !next || !again || !code.ready}
            >
              Change password
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = usePlatformMe();

  if (me.isPending || (me.error instanceof ApiError && me.error.status === 401))
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-[14px]" />
      </div>
    );
  if (me.isError)
    return (
      <div className="grid min-h-dvh place-items-center">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link
            href="/platform"
            className="flex items-center gap-2 font-semibold"
          >
            <span className="grid size-7 place-items-center rounded-[8px] bg-foreground text-surface">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            Leadflow Platform
          </Link>
          {!me.data.must_change_password && (
            <nav aria-label="Platform" className="flex flex-wrap gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={isActive(pathname, n.href) ? "page" : undefined}
                  className={cn(
                    "rounded-[9px] px-2.5 py-1.5 text-[14px] font-medium",
                    isActive(pathname, n.href)
                      ? "bg-accent-soft text-accent"
                      : "text-foreground/80 hover:bg-surface-2",
                  )}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2 text-[13px] text-muted">
            <span className="hidden sm:inline">
              {me.data.email} · {PLATFORM_ROLE_LABEL[me.data.role]}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void platformSignOut()}
            >
              <LogOut aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        {me.data.must_change_password ? (
          <PlatformChangePassword forced />
        ) : (
          children
        )}
      </main>
    </div>
  );
}
