"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { useAuth } from "./auth";

/** Shown when the signed-in user lacks a screen's permission — a clear state, never a broken or empty page. */
export function NoAccess({ what = "this page" }: { what?: string }) {
  return (
    <EmptyState
      icon={Lock}
      title="You don't have access"
      description={`Your role doesn't include ${what}. Ask an admin if you think you should have it.`}
    />
  );
}

export function RequirePermission({
  permission,
  what,
  children,
}: {
  permission: string | string[];
  what?: string;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  const needed = Array.isArray(permission) ? permission : [permission];
  return needed.every(can) ? <>{children}</> : <NoAccess what={what} />;
}

/** Renders children only when the permission is held (buttons, menu items, sections). */
export function Can({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : null;
}
