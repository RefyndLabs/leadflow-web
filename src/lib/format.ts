import { parsePhoneNumberFromString } from "libphonenumber-js";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

export function formatTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : timeFmt.format(d);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
];

export function formatRelative(
  value: string | null | undefined,
  now = Date.now(),
): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return "just now";
}

export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined) return "—";
  const code =
    currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  try {
    return new Intl.NumberFormat(
      undefined,
      code
        ? { style: "currency", currency: code }
        : { maximumFractionDigits: 2 },
    ).format(amount);
  } catch {
    return `${amount} ${code ?? ""}`.trim();
  }
}

/**
 * Phones are stored in E.164 (+6591234567). Show them grouped the way people read them (+65 9123 4567).
 * Use the raw value for tel: and wa.me links; anything we can't parse is shown as it is.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  if (!phone.startsWith("+")) return phone;
  return parsePhoneNumberFromString(phone)?.formatInternational() ?? phone;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** `tel:` links must only ever contain dialable characters. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Only http(s) URLs become links — `file_url` fields are free text from the API. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:"
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}

/** "SE" → 🇸🇪. Decorative only: always print the country name or code next to it. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** API instant → value for `<input type="datetime-local">`, in the person's own time zone. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local midnight `days` from `base`, as ISO 8601 with the local offset (what the API's date filters take). */
export function localMidnight(days = 0, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return isoWithOffset(d);
}

/** "2026-10-09" (a local calendar day) → that day's local midnight, ISO with offset. */
export function dayStart(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : isoWithOffset(d);
}

export function isoWithOffset(d: Date): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  );
}

/** A show's dates: "8 Oct 2026" or "8 Oct 2026 – 11 Oct 2026". */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start) return "—";
  return end && end !== start
    ? `${formatDate(start)} – ${formatDate(end)}`
    : formatDate(start);
}

/** True when the instant is already behind us (overdue follow-ups and promises). */
export function isPast(value: string | null | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t < now;
}
