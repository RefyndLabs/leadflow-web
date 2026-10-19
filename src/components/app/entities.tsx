"use client";

import Link from "next/link";
import { accounts, contacts, events, products, users } from "@/lib/api/hooks";
import { Skeleton } from "@/components/ui/feedback";
import { initials } from "@/lib/format";
import { useAuth } from "./auth";

/**
 * `LeadRead` only carries ids. These resolve them to names through the same cache the list
 * screens seed, so a page of 25 leads costs at most the two "first 200" list calls, plus a
 * single fetch for any id outside that window.
 */
function NameSkeleton() {
  return <Skeleton className="inline-block h-3.5 w-24 align-middle" />;
}

export function ContactName({
  id,
  link,
}: {
  id: string | null | undefined;
  link?: boolean;
}) {
  const { can } = useAuth();
  const q = contacts.useOne(id, { enabled: can("contacts:read") });
  if (!id) return <span className="text-muted">—</span>;
  if (q.isPending && can("contacts:read")) return <NameSkeleton />;
  const name = q.data?.name ?? "Unknown contact";
  return link && q.data ? (
    <Link href={`/contacts/${id}`} className="hover:underline">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}

export function AccountName({
  id,
  link,
}: {
  id: string | null | undefined;
  link?: boolean;
}) {
  const { can } = useAuth();
  const q = accounts.useOne(id, { enabled: can("accounts:read") });
  if (!id) return <span className="text-muted">—</span>;
  if (q.isPending && can("accounts:read")) return <NameSkeleton />;
  const name = q.data?.name ?? "Unknown company";
  return link && q.data ? (
    <Link href={`/accounts/${id}`} className="hover:underline">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}

/** Execs cannot list users (users:read is manager+), so unknown owners read as "Teammate". */
export function UserName({ id }: { id: string | null | undefined }) {
  const { me, can } = useAuth();
  const q = users.useOne(id, {
    enabled: Boolean(id) && id !== me.id && can("users:read"),
  });
  if (!id) return <span className="text-muted">Unassigned</span>;
  if (id === me.id) return <>You</>;
  if (q.data) return <>{q.data.name}</>;
  if (q.isPending && can("users:read")) return <NameSkeleton />;
  return <>Teammate</>;
}

export function ProductName({ id }: { id: string | null | undefined }) {
  const { can } = useAuth();
  const q = products.useOne(id, { enabled: can("catalog:read") });
  if (!id) return <span className="text-muted">—</span>;
  if (q.isPending && can("catalog:read")) return <NameSkeleton />;
  return <>{q.data?.name ?? "Unknown product"}</>;
}

export function EventName({ id }: { id: string | null | undefined }) {
  const { can } = useAuth();
  const q = events.useOne(id, { enabled: can("events:read") });
  if (!id) return <span className="text-muted">—</span>;
  if (q.isPending && can("events:read")) return <NameSkeleton />;
  return <>{q.data?.name ?? "Unknown exhibition"}</>;
}

/** Initials disc for a contact; decorative (the name is always printed next to it). */
export function ContactAvatar({
  id,
  size = "md",
}: {
  id: string | null | undefined;
  size?: "md" | "lg";
}) {
  const { can } = useAuth();
  const q = contacts.useOne(id, { enabled: can("contacts:read") });
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-muted ${size === "lg" ? "size-14 text-[18px]" : "size-10 text-[13px]"}`}
      aria-hidden
    >
      {initials(q.data?.name)}
    </span>
  );
}
