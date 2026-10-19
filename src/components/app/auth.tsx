"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { localPost } from "@/lib/api/client";
import { useMeQuery } from "@/lib/api/hooks";
import type { Me } from "@/lib/api/types";
import { can as canDo } from "@/lib/permissions";

interface AuthValue {
  me: Me;
  can: (permission: string) => boolean;
  signOut: (everywhere?: boolean) => Promise<void>;
}

const AuthCtx = React.createContext<AuthValue | null>(null);

export function AuthProvider({
  me,
  children,
}: {
  me: Me;
  children: React.ReactNode;
}) {
  const qc = useQueryClient();
  const value = React.useMemo<AuthValue>(
    () => ({
      me,
      can: (p) => canDo(me, p),
      signOut: async (everywhere = false) => {
        try {
          await localPost(
            everywhere ? "/api/auth/logout-all" : "/api/auth/logout",
          );
        } catch {
          /* the server clears the cookie regardless; a failed call still ends up at the login screen */
        }
        qc.clear(); // no cached customer data survives a sign-out
        // Full reload on purpose: drops every in-memory trace of the session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login?reason=signed-out");
      },
    }),
    [me, qc],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Gate for a screen: shows a clear "no access" state instead of a broken or empty one. */
export function useMeGate() {
  const q = useMeQuery();
  return q;
}
