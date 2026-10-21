/**
 * "Save contact": a contact card (vCard 3.0, the version every phone and desktop
 * contacts app reads) and, on Android, an intent that opens the Contacts app's
 * "new contact" screen already filled in.
 */

export interface ContactCardInput {
  name: string;
  phone?: string | null;
  alternatePhone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  website?: string | null;
  note?: string | null;
}

/** vCard text escaping (RFC 2426 §4): backslash, comma, semicolon and line breaks. */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Long lines are folded (CRLF + space) at 75 characters, never inside a character. */
function fold(line: string): string {
  const chars = Array.from(line);
  if (chars.length <= 75) return line;
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += i === 0 ? 75 : 74) {
    parts.push(chars.slice(i, i + (i === 0 ? 75 : 74)).join(""));
  }
  return parts.join("\r\n ");
}

const digits = (n: string) => n.replace(/[^\d+]/g, "");

/** "Anna Maria Berg" -> family "Berg", given "Anna Maria". */
function splitName(name: string): { family: string; given: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { family: "", given: parts[0] ?? "" };
  return {
    family: parts[parts.length - 1]!,
    given: parts.slice(0, -1).join(" "),
  };
}

export function buildVCard(c: ContactCardInput): string {
  const { family, given } = splitName(c.name);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(c.name.trim())}`,
  ];
  if (c.company) lines.push(`ORG:${esc(c.company)}`);
  if (c.title) lines.push(`TITLE:${esc(c.title)}`);
  const seen = new Set<string>();
  const tel = (
    raw: string | null | undefined,
    type: string,
    label?: string,
  ) => {
    const n = raw ? digits(raw) : "";
    if (!n || seen.has(n)) return;
    seen.add(n);
    if (label) {
      // Apple's custom label; other apps show it as an extra number.
      const item = `item${seen.size}`;
      lines.push(
        `${item}.TEL;TYPE=${type}:${n}`,
        `${item}.X-ABLabel:${esc(label)}`,
      );
    } else lines.push(`TEL;TYPE=${type}:${n}`);
  };
  tel(c.phone, "CELL,VOICE");
  tel(c.alternatePhone, "VOICE");
  tel(c.whatsapp, "CELL", "WhatsApp");
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
  if (c.website) lines.push(`URL:${esc(c.website)}`);
  if (c.note) lines.push(`NOTE:${esc(c.note)}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A safe file name for the card ("Anna Berg.vcf"). */
export function vcardFileName(name: string): string {
  const base = Array.from(name)
    .filter((ch) => ch.charCodeAt(0) >= 32 && !'\\/:*?"<>|'.includes(ch))
    .join("")
    .trim()
    .slice(0, 80);
  return `${base || "contact"}.vcf`;
}

/**
 * Android: opens Contacts' "new contact" screen with the details filled in
 * (ContactsContract.Intents.Insert). Chrome and most Android browsers follow
 * `intent:` links from a tap.
 */
export function androidContactIntent(c: ContactCardInput): string {
  const extras: [string, string | null | undefined][] = [
    ["name", c.name.trim()],
    ["phone", c.phone ? digits(c.phone) : null],
    ["secondary_phone", c.alternatePhone ? digits(c.alternatePhone) : null],
    ["email", c.email],
    ["company", c.company],
    ["job_title", c.title],
    ["notes", c.note],
  ];
  const parts = extras
    .filter((e): e is [string, string] => Boolean(e[1]))
    .map(([k, v]) => `S.${k}=${encodeURIComponent(v)}`);
  // Insert.PHONE_TYPE = Phone.TYPE_MOBILE (2).
  if (c.phone) parts.push("i.phone_type=2");
  return `intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/raw_contact;${parts.join(";")};end`;
}

export function isAndroid(userAgent: string): boolean {
  return /\bAndroid\b/i.test(userAgent);
}
