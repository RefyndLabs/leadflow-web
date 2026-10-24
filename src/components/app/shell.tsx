"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { useMeQuery } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/errors";
import { initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { AuthProvider, useAuth } from "./auth";
import { ChangePassword } from "./profile";
import { ACCOUNT_ITEMS, NAV, TAB_HREFS, isActive, type NavItem } from "./nav";

function useVisibleNav() {
  const { can } = useAuth();
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => can(i.permission)),
  })).filter((g) => g.items.length > 0);
  const all = groups.flatMap((g) => g.items);
  return { groups, all };
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg px-2 py-1 text-[17px] font-semibold tracking-tight"
    >
      <span className="grid size-7 place-items-center rounded-[8px] bg-accent text-accent-fg">
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 6h10M4 12h16M4 18h7" />
        </svg>
      </span>
      Leadflow
    </Link>
  );
}

function UserMenu({ compact }: { compact?: boolean }) {
  const { me, signOut } = useAuth();
  return (
    <Menu>
      <MenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left hover:bg-surface-2 data-[state=open]:bg-surface-2",
          compact && "w-auto",
        )}
        aria-label="Account menu"
      >
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent"
          aria-hidden
        >
          {initials(me.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium leading-tight">
            {me.name}
          </span>
          <span className="block truncate text-[12px] text-muted">
            {me.organization.name}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </MenuTrigger>
      <MenuContent side="top" align="start" className="w-64">
        <MenuLabel>
          {me.email} · {ROLE_LABEL[me.role]}
        </MenuLabel>
        <MenuSeparator />
        {ACCOUNT_ITEMS.map((i) => (
          <MenuItem key={i.href} asChild>
            <Link href={i.href}>
              <i.icon aria-hidden />
              {i.label}
            </Link>
          </MenuItem>
        ))}
        <MenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[14px] font-medium transition-colors",
        active
          ? "bg-accent-soft text-accent"
          : "text-foreground/80 hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <item.icon className="size-[18px] shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { groups, all } = useVisibleNav();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
      <div className="px-3 pb-2 pt-4">
        <Brand />
      </div>
      <nav
        aria-label="Main"
        className="flex-1 space-y-5 overflow-y-auto px-3 py-3"
      >
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {g.label}
            </p>
            <div className="space-y-0.5">
              {g.items.map((i) => (
                <SidebarLink
                  key={i.href}
                  item={i}
                  active={isActive(pathname, i, all)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <UserMenu />
      </div>
    </aside>
  );
}

function TabBar() {
  const pathname = usePathname();
  const { all } = useVisibleNav();
  const { signOut, me } = useAuth();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const tabs = all.filter((i) =>
    (TAB_HREFS as readonly string[]).includes(i.href),
  );
  const rest = all.filter(
    (i) => !(TAB_HREFS as readonly string[]).includes(i.href),
  );
  const moreActive =
    rest.some((i) => isActive(pathname, i, all)) ||
    pathname.startsWith("/settings");

  const tabClass = (active: boolean) =>
    cn(
      "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium",
      active ? "text-accent" : "text-muted",
    );

  return (
    <>
      <nav
        aria-label="Main"
        className="glass pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line lg:hidden"
      >
        <div className="mx-auto flex max-w-xl items-stretch px-2 pt-1">
          {tabs.map((i) => {
            const active = isActive(pathname, i, all);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                <i.icon
                  className="size-6"
                  strokeWidth={active ? 2.4 : 1.9}
                  aria-hidden
                />
                {i.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={tabClass(moreActive)}
            aria-haspopup="dialog"
          >
            <MoreHorizontal
              className="size-6"
              strokeWidth={moreActive ? 2.4 : 1.9}
              aria-hidden
            />
            More
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          title="More"
          description={`${me.name} · ${me.organization.name}`}
        >
          <div className="-mx-2 space-y-1">
            {rest.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setMoreOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-[16px] hover:bg-surface-2"
              >
                <i.icon className="size-5 text-muted" aria-hidden />
                {i.label}
              </Link>
            ))}
            {ACCOUNT_ITEMS.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setMoreOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-[16px] hover:bg-surface-2"
              >
                <ShieldCheck className="size-5 text-muted" aria-hidden />
                {i.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[16px] text-danger hover:bg-danger-soft"
            >
              <LogOut className="size-5" aria-hidden />
              Sign out
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh lg:pl-60">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="mt-6 h-64 w-full rounded-[14px]" />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const q = useMeQuery();

  if (q.isPending) return <ShellSkeleton />;
  if (q.isError) {
    // A 401 has already triggered the redirect to /login; anything else gets a retry.
    if (q.error instanceof ApiError && q.error.status === 401)
      return <ShellSkeleton />;
    return (
      <div className="grid min-h-dvh place-items-center">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  // A temporary password a platform admin set: the person chooses their own first.
  if (q.data.must_change_password)
    return (
      <AuthProvider me={q.data}>
        <main id="main" className="mx-auto max-w-lg px-4 py-10">
          <h1 className="mb-2 text-[26px] font-semibold tracking-tight">
            Choose your own password
          </h1>
          <p className="mb-5 text-[14px] text-muted">
            You signed in with a temporary password. Type it as the current
            password, then choose a new one.
          </p>
          <ChangePassword onChanged={() => void q.refetch()} />
        </main>
      </AuthProvider>
    );

  return (
    <AuthProvider me={q.data}>
      <Sidebar />
      <div className="min-h-dvh lg:pl-60">
        <main
          id="main"
          className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8"
        >
          {children}
        </main>
      </div>
      <TabBar />
    </AuthProvider>
  );
}
