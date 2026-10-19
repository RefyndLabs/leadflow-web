import {
  BellRing,
  Building2,
  Camera,
  CalendarDays,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Package,
  ScanLine,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only when the user holds this permission (from /auth/me — never from the role name). */
  permission: string;
  /** Also highlighted for these path prefixes. */
  match?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      {
        href: "/",
        label: "Home",
        icon: LayoutDashboard,
        permission: "leads:read",
      },
      { href: "/leads", label: "Leads", icon: Inbox, permission: "leads:read" },
      {
        href: "/contacts",
        label: "Contacts",
        icon: UserRound,
        permission: "contacts:read",
      },
      {
        href: "/accounts",
        label: "Companies",
        icon: Building2,
        permission: "accounts:read",
      },
      {
        href: "/follow-ups",
        label: "Follow-ups",
        icon: BellRing,
        permission: "cadences:read",
      },
    ],
  },
  {
    label: "Catalog & events",
    items: [
      {
        href: "/catalog",
        label: "Catalog",
        icon: Package,
        permission: "catalog:read",
      },
      {
        href: "/events",
        label: "Exhibitions",
        icon: CalendarDays,
        permission: "events:read",
      },
      {
        href: "/events/capture",
        label: "Capture at a show",
        icon: ScanLine,
        permission: "captures:write",
      },
      {
        href: "/captures",
        label: "Captures",
        icon: Camera,
        permission: "captures:read",
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        href: "/settings/team",
        label: "Team",
        icon: Users,
        permission: "users:read",
      },
      {
        href: "/settings/api-keys",
        label: "API keys",
        icon: KeyRound,
        permission: "keys:manage",
      },
      {
        href: "/settings/organization",
        label: "Organization",
        icon: Settings2,
        permission: "org:read",
      },
      {
        href: "/settings/audit",
        label: "Audit log",
        icon: History,
        permission: "audit:read",
      },
    ],
  },
];

/** The four sections that get a slot in the phone tab bar; everything else lives under "More". */
export const TAB_HREFS = ["/", "/leads", "/contacts", "/follow-ups"] as const;

export const ACCOUNT_ITEMS = [
  { href: "/settings/profile", label: "Profile & security", icon: ShieldCheck },
] as const;

export function isActive(
  pathname: string,
  item: Pick<NavItem, "href">,
  all: NavItem[],
): boolean {
  if (item.href === "/") return pathname === "/";
  // "/events" must not light up on "/events/capture" when that has its own entry.
  const moreSpecific = all.some(
    (o) =>
      o.href !== item.href &&
      o.href.startsWith(item.href + "/") &&
      (pathname === o.href || pathname.startsWith(o.href + "/")),
  );
  if (moreSpecific) return false;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
