import Papa from "papaparse";
import { TOUCHPOINT_CHANNELS } from "./enums";
import { leadIngest } from "./schemas";

/** Bulk-ingest accepts at most 500 rows per call. */
export const BULK_CHUNK = 500;
export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Column headers people are likely to type → the API's field names. Matching ignores case, spaces and punctuation. */
const ALIASES: Record<string, string> = {
  contactname: "contact_name",
  name: "contact_name",
  fullname: "contact_name",
  contactphone: "contact_phone",
  phone: "contact_phone",
  mobile: "contact_phone",
  phonenumber: "contact_phone",
  contactemail: "contact_email",
  email: "contact_email",
  emailaddress: "contact_email",
  contactdesignation: "contact_designation",
  designation: "contact_designation",
  jobtitle: "contact_designation",
  title: "contact_designation",
  accountname: "account_name",
  company: "account_name",
  companyname: "account_name",
  account: "account_name",
  accountdomain: "account_domain",
  domain: "account_domain",
  website: "account_website",
  accountwebsite: "account_website",
  country: "account_country",
  accountcountry: "account_country",
  whatsapp: "contact_whatsapp",
  contactwhatsapp: "contact_whatsapp",
  buyertype: "buyer_type",
  requirementtype: "requirement_type",
  volume: "approx_volume",
  approxvolume: "approx_volume",
  packagingrequirement: "packaging_requirement",
  destinationmarket: "destination_market",
  destination: "destination_market",
  timeline: "expected_timeline",
  expectedtimeline: "expected_timeline",
  targetprice: "target_price",
  incoterm: "incoterm",
  preferredcontactchannel: "preferred_contact_channel",
  quality: "quality_tag",
  qualitytag: "quality_tag",
  rating: "quality_tag",
  accountindustry: "account_industry",
  industry: "account_industry",
  accountlocation: "account_location",
  location: "account_location",
  city: "account_location",
  source: "source",
  channel: "touchpoint_channel",
  touchpointchannel: "touchpoint_channel",
  direction: "touchpoint_direction",
  touchpointdirection: "touchpoint_direction",
  message: "touchpoint_content",
  content: "touchpoint_content",
  notes: "touchpoint_content",
  touchpointcontent: "touchpoint_content",
  division: "division",
  eventid: "event_id",
  productid: "product_id",
};

const SOURCE_ALIASES: Record<string, string> = {
  partner: "tpp",
  "third party": "tpp",
  "walk in": "in_person",
  "in person": "in_person",
  visit: "in_person",
  phone: "call",
  "whats app": "whatsapp",
};

export const TEMPLATE_HEADERS = [
  "contact_name",
  "contact_phone",
  "contact_email",
  "contact_designation",
  "account_name",
  "account_domain",
  "account_industry",
  "account_location",
  "source",
  "division",
  "touchpoint_direction",
  "touchpoint_channel",
  "touchpoint_content",
  "contact_whatsapp",
  "account_country",
  "account_website",
  "buyer_type",
  "requirement_type",
  "approx_volume",
  "destination_market",
  "incoterm",
  "quality_tag",
] as const;

export function templateCsv(): string {
  const example = [
    "Asha Rao",
    "+91 98765 43210",
    "asha@example.com",
    "Purchase manager",
    "Rao Textiles Pvt Ltd",
    "raotextiles.com",
    "Textiles",
    "Surat, India",
    "website",
    "",
    "inbound",
    "website",
    "Looking for 500 kg of cotton yarn",
    "",
    "IN",
    "raotextiles.com",
    "manufacturer",
    "regular_supply",
    "500 kg per month",
    "India",
    "FOB",
    "warm",
  ];
  return `${TEMPLATE_HEADERS.join(",")}\n${example.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")}\n`;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ParsedRow {
  /** 1-based row number in the file, excluding the header. */
  row: number;
  payload: Record<string, unknown> | null;
  errors: string[];
}

export interface ParsedSheet {
  rows: ParsedRow[];
  /** Headers in the file that we did not recognise (ignored). */
  ignored: string[];
  /** Required columns that no header maps to. */
  missing: string[];
}

function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function buildPayloads(
  records: Record<string, unknown>[],
  headers: string[],
): ParsedSheet {
  const mapping = new Map<string, string>();
  const ignored: string[] = [];
  for (const h of headers) {
    const direct = (TEMPLATE_HEADERS as readonly string[]).includes(h)
      ? h
      : undefined;
    const field = ALIASES[norm(h)] ?? direct;
    if (field) mapping.set(h, field);
    else if (h.trim()) ignored.push(h);
  }
  const present = new Set(mapping.values());
  const missing = [
    "contact_name",
    "contact_phone",
    "account_name",
    "source",
  ].filter((f) => !present.has(f));

  const rows: ParsedRow[] = records.map((rec, i) => {
    const flat: Record<string, string> = {};
    for (const [h, field] of mapping) flat[field] = clean(rec[h]);

    for (const k of ["buyer_type", "requirement_type", "quality_tag", "preferred_contact_channel"]) {
      if (flat[k]) flat[k] = flat[k]!.toLowerCase().replace(/[\s-]+/g, "_");
    }
    const src = flat.source?.toLowerCase().replace(/[_-]/g, " ").trim();
    if (src) flat.source = SOURCE_ALIASES[src] ?? src.replace(/ /g, "");

    const {
      touchpoint_direction,
      touchpoint_channel,
      touchpoint_content,
      ...base
    } = flat;
    const candidate: Record<string, unknown> = { ...base };
    if (touchpoint_content) {
      const fallbackChannel = (
        TOUCHPOINT_CHANNELS as readonly string[]
      ).includes(flat.source ?? "")
        ? flat.source
        : "call";
      const channel = (
        touchpoint_channel ||
        fallbackChannel ||
        "call"
      ).toLowerCase();
      candidate.touchpoint = {
        direction: (touchpoint_direction || "inbound").toLowerCase(),
        channel,
        content: touchpoint_content,
      };
    }

    const parsed = leadIngest.safeParse(candidate);
    if (parsed.success)
      return {
        row: i + 1,
        payload: parsed.data as Record<string, unknown>,
        errors: [],
      };
    return {
      row: i + 1,
      payload: null,
      errors: parsed.error.issues.map(
        (iss) => `${iss.path.join(".") || "row"}: ${iss.message}`,
      ),
    };
  });

  return { rows, ignored, missing };
}

export function parseCsv(text: string): {
  records: Record<string, unknown>[];
  headers: string[];
} {
  const res = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return { records: res.data, headers: res.meta.fields ?? [] };
}

/** Turns a 2-D sheet (first row = headers) into keyed records. */
export function sheetToRecords(data: unknown[][]): {
  records: Record<string, unknown>[];
  headers: string[];
} {
  const [head, ...body] = data;
  const headers = (head ?? []).map((h) => clean(h));
  const records = body
    .filter((r) => r.some((c) => clean(c) !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  return { records, headers };
}
