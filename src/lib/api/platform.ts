"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { buildQuery, type Query } from "./client";
import { ApiError, parseErrorBody } from "./errors";
import type { components } from "./schema";

/**
 * The platform console's client. It talks only to /api/platform/lf (its own
 * gateway and cookie), never to the customer gateway, and a 401 sends the
 * person to /platform/login, never to the customer sign-in.
 */
type S = components["schemas"];
export type PlatformMe = S["PlatformMe"];
export type PlatformOrg = S["PlatformOrgSummary"];
export type PlatformOrgDetail = S["PlatformOrgDetail"];
export type PlatformOrgCreated = S["PlatformOrgCreated"];
export type PlatformOrgUser = S["PlatformOrgUser"];
export type PlatformTemporaryPassword = S["PlatformTemporaryPassword"];
export type PlatformIntegrationKey = S["PlatformIntegrationKey"];
export type PlatformAdmin = S["PlatformAdminRead"];
export type PlatformAdminCreated = S["PlatformAdminCreated"];
export type PlatformAuditEntry = S["PlatformAuditEntry"];

const BASE = "/api/platform/lf";
let redirecting = false;

export function redirectToPlatformLogin(reason = "expired") {
  if (typeof window === "undefined" || redirecting) return;
  redirecting = true;
  // Full reload on purpose: drops every in-memory trace of the session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/platform/login?reason=${reason}`);
}

export async function platformApi<T>(
  path: string,
  opts: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    query?: Query;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-lf-csrf": "1",
  };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError({
      status: 0,
      detail: "Can't reach the server. Check your connection and try again.",
      code: "network",
    });
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.clone().json();
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401) redirectToPlatformLogin("expired");
    throw parseErrorBody(res.status, body, res.headers);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** POST to one of the console's own routes (/api/platform/login, verify, logout). */
export async function platformLocalPost<T = void>(
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lf-csrf": "1",
        accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError({
      status: 0,
      detail: "Can't reach the server. Check your connection and try again.",
      code: "network",
    });
  }
  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* ignore */
    }
    throw parseErrorBody(res.status, parsed, res.headers);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ── Queries ─────────────────────────────────────────────────────────────── */

export const platformKeys = {
  me: ["platform", "me"] as const,
  orgs: ["platform", "orgs"] as const,
  org: (slug: string) => ["platform", "org", slug] as const,
  users: (slug: string) => ["platform", "org", slug, "users"] as const,
  keys: ["platform", "integration-keys"] as const,
  admins: ["platform", "admins"] as const,
  audit: (org?: string) => ["platform", "audit", org ?? ""] as const,
};

export function usePlatformMe() {
  return useQuery({
    queryKey: platformKeys.me,
    queryFn: ({ signal }) => platformApi<PlatformMe>("/auth/me", { signal }),
    retry: false,
    staleTime: 60_000,
  });
}

export function usePlatformOrgs() {
  return useQuery({
    queryKey: platformKeys.orgs,
    queryFn: ({ signal }) =>
      platformApi<PlatformOrg[]>("/organizations", { signal }),
  });
}

export function usePlatformOrg(slug: string) {
  return useQuery({
    queryKey: platformKeys.org(slug),
    queryFn: ({ signal }) =>
      platformApi<PlatformOrgDetail>(`/organizations/${slug}`, { signal }),
  });
}

export function usePlatformOrgUsers(slug: string) {
  return useQuery({
    queryKey: platformKeys.users(slug),
    queryFn: ({ signal }) =>
      platformApi<PlatformOrgUser[]>(`/organizations/${slug}/users`, {
        signal,
      }),
  });
}

export function usePlatformKeys() {
  return useQuery({
    queryKey: platformKeys.keys,
    queryFn: ({ signal }) =>
      platformApi<PlatformIntegrationKey[]>("/integration-keys", { signal }),
  });
}

export function usePlatformAdmins() {
  return useQuery({
    queryKey: platformKeys.admins,
    queryFn: ({ signal }) =>
      platformApi<PlatformAdmin[]>("/admins", { signal }),
  });
}

export function usePlatformAudit(org?: string) {
  return useQuery({
    queryKey: platformKeys.audit(org),
    queryFn: ({ signal }) =>
      platformApi<PlatformAuditEntry[]>("/audit", {
        signal,
        query: { org, limit: 100 },
      }),
  });
}

/* ── Mutations ───────────────────────────────────────────────────────────── */

/**
 * One console action. Every change refreshes the console's data (the activity
 * log included). `handled`: the caller shows the error itself.
 */
export function usePlatformAction<V, T = unknown>(
  run: (vars: V) => Promise<T>,
  opts: {
    success?: string;
    handled?: boolean;
    onSuccess?: (data: T, vars: V) => void;
  } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    meta: { handled: opts.handled },
    onSuccess: (data, vars) => {
      invalidateAll(qc);
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(data, vars);
    },
  });
}

function invalidateAll(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["platform"] });
}
