import { z } from "zod";
import {
  APPROVAL_STATUSES,
  BUYER_TYPES,
  COLLATERAL_TYPES,
  CONTACT_CHANNELS,
  LEAD_NOTE_KINDS,
  LEAD_SOURCES,
  LEAD_STATUSES,
  QUALITY_TAGS,
  QUOTATION_STATUSES,
  REQUIREMENT_TYPES,
  SAMPLE_STATUSES,
  TOUCHPOINT_CHANNELS,
  TOUCHPOINT_DIRECTIONS,
  USER_ROLES,
} from "./enums";
import { GRANTABLE_KEY_SCOPES } from "./permissions";

/**
 * Zod mirrors of the API's write schemas (openapi.json). Every API body is strict:
 * unknown fields are a 422, so these are `strictObject`s with exactly the API's keys.
 * `src/lib/__tests__/schemas.test.ts` checks them against the committed openapi.json
 * so drift shows up as a failing test instead of a silent 422 in production.
 *
 * Forms hold strings. The helpers below turn "" into `undefined` (omit the field) or
 * `null` (clear the field on PATCH) so what reaches the API is already the right shape.
 */

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;
const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

export const req = (max: number, label = "This field") =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `Keep it under ${max} characters`);

/** Optional text: blank is omitted from the payload. */
export const text = (max: number) =>
  z.preprocess(
    emptyToUndef,
    z.string().trim().max(max, `Keep it under ${max} characters`).optional(),
  );

/** Optional text on PATCH: blank clears the field. */
export const textNull = (max: number) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, `Keep it under ${max} characters`).nullable(),
  );

export const optionalEmail = z.preprocess(
  emptyToUndef,
  z.email("Enter a valid email address").max(320).optional(),
);
export const optionalEmailNull = z.preprocess(
  emptyToNull,
  z.email("Enter a valid email address").max(320).nullable(),
);

export const optionalUuid = z.preprocess(
  emptyToUndef,
  z.uuid("Pick one from the list").optional(),
);
export const optionalUuidNull = z.preprocess(
  emptyToNull,
  z.uuid("Pick one from the list").nullable(),
);

const phoneRule = z
  .string()
  .trim()
  .max(50, "Keep it under 50 characters")
  .regex(/^[+()\d\s.\-x]+$/i, "Use digits, spaces, + ( ) - only")
  .refine(
    (v) => v.replace(/\D/g, "").length >= 6,
    "Phone number looks too short",
  );

/** Phone is optional now — the API needs a phone *or* an email (see `phoneOrEmail`). */
export const optionalPhone = z.preprocess(emptyToUndef, phoneRule.optional());
export const optionalPhoneNull = z.preprocess(
  emptyToNull,
  phoneRule.nullable(),
);

/** Cross-field rule shared by every form that creates a person. */
export const phoneOrEmail =
  (phoneKey: string, emailKey: string) => (v: Record<string, unknown>) =>
    Boolean(v[phoneKey] || v[emailKey]);
const PHONE_OR_EMAIL_MSG =
  "Add a phone number or an email so we can recognise this person again";

const httpUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => /^https?:\/\//i.test(v) && URL.canParse(v),
      "Enter a full link starting with http:// or https://",
    );

export const optionalUrl = (max = 2000) =>
  z.preprocess(emptyToUndef, httpUrl(max).optional());
export const optionalUrlNull = (max = 2000) =>
  z.preprocess(emptyToNull, httpUrl(max).nullable());
export const requiredUrl = (max = 2000) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    httpUrl(max).min(1, "A link is required"),
  );

/** "a, b ,c" → ["a","b","c"] (deduped). Blank → undefined. */
export function parseTags(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.length ? (v as string[]) : undefined;
  if (typeof v !== "string") return undefined;
  const tags = [
    ...new Set(
      v
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
  return tags.length ? tags : undefined;
}
export const tags = z.preprocess(
  parseTags,
  z.array(z.string().max(100)).max(50, "Up to 50 tags").optional(),
);
/** On PATCH, blank tags clear the list. */
export const tagsNull = z.preprocess(
  (v) => parseTags(v) ?? null,
  z.array(z.string().max(100)).max(50, "Up to 50 tags").nullable(),
);

const number = (label: string) =>
  z.preprocess(
    (v) =>
      typeof v === "string" ? (v.trim() === "" ? undefined : Number(v)) : v,
    z
      .number({ error: `${label} must be a number` })
      .min(0, `${label} can't be negative`)
      .max(9_999_999_999),
  );

/** Optional enum from a <select>: blank is omitted (create) or cleared (PATCH). */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(emptyToUndef, z.enum(values).optional());
const optionalEnumNull = <T extends readonly [string, ...string[]]>(
  values: T,
) => z.preprocess(emptyToNull, z.enum(values).nullable());

/** Two-letter country code from a <select>; the API upper-cases it too. */
const countryCode = z
  .string()
  .regex(/^[A-Za-z]{2}$/, "Choose a country")
  .transform((v) => v.toUpperCase());
export const optionalCountry = z.preprocess(
  emptyToUndef,
  countryCode.optional(),
);
export const optionalCountryNull = z.preprocess(
  emptyToNull,
  countryCode.nullable(),
);

/** "example.com" → "https://example.com": people rarely type the scheme. Anything else is kept as typed. */
export function normalizeWebsite(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!t) return t;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
}
const website = (max: number) =>
  z
    .string()
    .max(max, `Keep it under ${max} characters`)
    .refine(
      (v) => /^https?:\/\//i.test(v) && URL.canParse(v),
      "Enter a website, e.g. example.com",
    );
export const optionalWebsite = (max = 500) =>
  z.preprocess(
    (v) => normalizeWebsite(emptyToUndef(v)),
    website(max).optional(),
  );
export const optionalWebsiteNull = (max = 500) =>
  z.preprocess(
    (v) => normalizeWebsite(emptyToNull(v)),
    website(max).nullable(),
  );

/** Yes / No / Don't know select → true / false / omitted (or null on PATCH). */
const yesNo = (v: unknown) =>
  v === "yes" || v === true ? true : v === "no" || v === false ? false : v;
export const optionalYesNo = z.preprocess(
  (v) => yesNo(emptyToUndef(v)),
  z.boolean().optional(),
);
export const optionalYesNoNull = z.preprocess(
  (v) => yesNo(emptyToNull(v)),
  z.boolean().nullable(),
);

/**
 * `<input type="datetime-local">` gives local wall-clock time with no zone ("2026-10-12T09:00").
 * It is sent as an instant (UTC ISO), so the API stores what the person meant in their own time zone.
 */
export function localInputToIso(v: unknown): unknown {
  if (typeof v !== "string" || v.trim() === "") return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}
const instant = z.iso.datetime({
  offset: true,
  error: "Choose a valid date and time",
});
export const optionalInstant = z.preprocess(
  (v) => localInputToIso(emptyToUndef(v)),
  instant.optional(),
);
export const optionalInstantNull = z.preprocess(
  (v) => localInputToIso(emptyToNull(v)),
  instant.nullable(),
);

/** Incoterm: one of the picker's codes or free text, upper-cased like the API does. */
const upper = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : v);
const incoterm = z.preprocess(
  (v) => upper(emptyToUndef(v)),
  z.string().max(20, "Keep it under 20 characters").optional(),
);
const incotermNull = z.preprocess(
  (v) => upper(emptyToNull(v)),
  z.string().max(20, "Keep it under 20 characters").nullable(),
);

/** "More details" on a lead (hand-off §4.3 D). Blank fields are left out on create. */
export const exportDetails = {
  buyer_type: optionalEnum(BUYER_TYPES),
  requirement_type: optionalEnum(REQUIREMENT_TYPES),
  approx_volume: text(300),
  packaging_requirement: text(1000),
  destination_market: text(300),
  samples_requested: optionalYesNo,
  sample_requirement: text(1000),
  expected_timeline: text(300),
  target_price: text(300),
  incoterm,
  preferred_contact_channel: optionalEnum(CONTACT_CHANNELS),
};
/** The same fields on PATCH, where a blank clears the value. */
export const exportDetailsNull = {
  buyer_type: optionalEnumNull(BUYER_TYPES),
  requirement_type: optionalEnumNull(REQUIREMENT_TYPES),
  approx_volume: textNull(300),
  packaging_requirement: textNull(1000),
  destination_market: textNull(300),
  samples_requested: optionalYesNoNull,
  sample_requirement: textNull(1000),
  expected_timeline: textNull(300),
  target_price: textNull(300),
  incoterm: incotermNull,
  preferred_contact_channel: optionalEnumNull(CONTACT_CHANNELS),
};
export type ExportDetailKey = keyof typeof exportDetails;
export const EXPORT_DETAIL_KEYS = Object.keys(
  exportDetails,
) as ExportDetailKey[];

/** One product on a lead. The first in a list is the main product. */
export const leadProductIn = z.strictObject({
  product_id: z.uuid("Pick a product from the catalogue"),
  quantity: z.preprocess(emptyToNull, z.string().trim().max(300).nullish()),
  note: z.preprocess(emptyToNull, z.string().trim().max(1000).nullish()),
});
export const leadProductsUpdate = z.strictObject({
  products: z.array(leadProductIn).max(50, "Up to 50 products"),
});

/** A note, conversation summary or promise. A promise's due date can move the lead's next follow-up. */
export const leadNoteCreate = z.strictObject({
  kind: z.enum(LEAD_NOTE_KINDS).optional(),
  body: req(20000, "Text"),
  pinned: z.boolean().optional(),
  due_at: optionalInstant,
});
export const leadNoteUpdate = z.strictObject({
  body: req(20000, "Text").optional(),
  pinned: z.boolean().optional(),
  due_at: optionalInstantNull.optional(),
  completed: z.boolean().optional(),
});

/* ── Auth ─────────────────────────────────────────────────────────────── */
export const loginPayload = z.strictObject({
  email: z.email("Enter a valid email address").max(320),
  password: z.string().min(1, "Enter your password").max(128),
});
export const changePasswordPayload = z.strictObject({
  current_password: z.string().min(1, "Enter your current password").max(128),
  new_password: z.string().min(1, "Enter a new password").max(128),
});

/* ── Accounts / contacts ──────────────────────────────────────────────── */
export const accountCreate = z.strictObject({
  name: req(300, "Company name"),
  domain: text(300),
  industry: text(300),
  location: text(300),
  country: optionalCountry,
  website: optionalWebsite(),
});
export const accountUpdate = z.strictObject({
  name: req(300, "Company name"),
  domain: textNull(300),
  industry: textNull(300),
  location: textNull(300),
  country: optionalCountryNull.optional(),
  website: optionalWebsiteNull().optional(),
});

export const contactCreate = z
  .strictObject({
    name: req(300, "Name"),
    phone: optionalPhone,
    email: optionalEmail,
    designation: text(300),
    whatsapp: optionalPhone,
    alternate_phone: optionalPhone,
    account_id: optionalUuid,
  })
  .refine(phoneOrEmail("phone", "email"), {
    message: PHONE_OR_EMAIL_MSG,
    path: ["phone"],
  });
export const contactUpdate = z
  .strictObject({
    name: req(300, "Name"),
    phone: optionalPhoneNull,
    email: optionalEmailNull,
    designation: textNull(300),
    whatsapp: optionalPhoneNull.optional(),
    alternate_phone: optionalPhoneNull.optional(),
    account_id: optionalUuidNull,
  })
  .refine(phoneOrEmail("phone", "email"), {
    message: PHONE_OR_EMAIL_MSG,
    path: ["phone"],
  });

/* ── Leads ────────────────────────────────────────────────────────────── */
export const leadSource = z.enum(LEAD_SOURCES, { error: "Choose a source" });
export const touchpointChannel = z.enum(TOUCHPOINT_CHANNELS, {
  error: "Choose a channel",
});
export const touchpointDirection = z.enum(TOUCHPOINT_DIRECTIONS, {
  error: "Choose a direction",
});

export const leadCreate = z.strictObject({
  contact_id: z.uuid("Choose a contact"),
  account_id: z.uuid("Choose a company"),
  source: leadSource,
  division: text(200),
  owner_id: optionalUuid,
  event_id: optionalUuid,
  product_id: optionalUuid,
  lead_title: text(200),
  requirement_summary: text(4000),
  quality_tag: optionalEnum(QUALITY_TAGS),
  next_follow_up_at: optionalInstant,
  ...exportDetails,
});

/**
 * PATCH /leads/{id}. Every key is optional so a screen can send only what it edits (the export
 * details card, the pause toggle); a blank value clears that field.
 */
export const leadUpdate = z.strictObject({
  division: textNull(200).optional(),
  owner_id: optionalUuidNull.optional(),
  quality_tag: z
    .preprocess(emptyToNull, z.enum(QUALITY_TAGS).nullable())
    .optional(),
  event_id: optionalUuidNull.optional(),
  product_id: optionalUuidNull.optional(),
  lead_title: textNull(200).optional(),
  requirement_summary: textNull(4000).optional(),
  next_follow_up_at: optionalInstantNull.optional(),
  follow_ups_paused: z.boolean().optional(),
  buyer_type: exportDetailsNull.buyer_type.optional(),
  requirement_type: exportDetailsNull.requirement_type.optional(),
  approx_volume: exportDetailsNull.approx_volume.optional(),
  packaging_requirement: exportDetailsNull.packaging_requirement.optional(),
  destination_market: exportDetailsNull.destination_market.optional(),
  samples_requested: exportDetailsNull.samples_requested.optional(),
  sample_requirement: exportDetailsNull.sample_requirement.optional(),
  expected_timeline: exportDetailsNull.expected_timeline.optional(),
  target_price: exportDetailsNull.target_price.optional(),
  incoterm: exportDetailsNull.incoterm.optional(),
  preferred_contact_channel:
    exportDetailsNull.preferred_contact_channel.optional(),
});

export const leadStatusUpdate = z.strictObject({
  status: z.enum(LEAD_STATUSES),
  reason: text(2000),
});
export const leadLostUpdate = z.strictObject({
  status: z.literal("lost"),
  reason: req(2000, "A reason"),
});
export const leadScoreUpdate = z.strictObject({
  quality_tag: z.enum(QUALITY_TAGS),
});
export const leadAssignUpdate = z.strictObject({
  owner_id: z.uuid().nullable(),
});

export const touchpointCreate = z.strictObject({
  direction: touchpointDirection,
  channel: touchpointChannel,
  content: text(20000),
  raw_source_ref: text(2000),
  approved_by_user_id: z.uuid().nullish(),
  approved_at: z.string().nullish(),
});

export const ingestTouchpoint = z.strictObject({
  direction: touchpointDirection,
  channel: touchpointChannel,
  content: text(20000),
  raw_source_ref: text(2000),
});

export const leadIngest = z
  .strictObject({
    contact_name: req(300, "Contact name"),
    contact_phone: optionalPhone,
    contact_email: optionalEmail,
    contact_designation: text(300),
    contact_whatsapp: optionalPhone,
    contact_alternate_phone: optionalPhone,
    account_name: req(300, "Company name"),
    account_domain: text(300),
    account_industry: text(300),
    account_location: text(300),
    account_country: optionalCountry,
    account_website: optionalWebsite(),
    source: leadSource,
    division: text(200),
    event_id: optionalUuid,
    product_id: optionalUuid,
    products: z.array(leadProductIn).max(50).optional(),
    quality_tag: optionalEnum(QUALITY_TAGS),
    owner_id: optionalUuid,
    next_follow_up_at: optionalInstant,
    notes: z.array(leadNoteCreate).max(50).optional(),
    lead_resolution: z.enum(["auto", "new", "attach"]).optional(),
    lead_id: optionalUuid,
    lead_title: text(200),
    requirement_summary: text(4000),
    touchpoint: ingestTouchpoint.nullish(),
    ...exportDetails,
  })
  .refine(phoneOrEmail("contact_phone", "contact_email"), {
    message: PHONE_OR_EMAIL_MSG,
    path: ["contact_phone"],
  });

/* ── Quotations / samples ─────────────────────────────────────────────── */
const currency = z.preprocess(
  (v) =>
    typeof v === "string"
      ? v.trim() === ""
        ? undefined
        : v.trim().toUpperCase()
      : v,
  z
    .string()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter code, e.g. USD")
    .optional(),
);
export const quotationCreate = z.strictObject({
  product_id: optionalUuid,
  amount: z.preprocess(
    (v) => (v === "" ? undefined : v),
    number("Amount").optional(),
  ),
  currency,
  file_url: optionalUrl(),
});
export const quotationUpdate = z.strictObject({
  product_id: optionalUuid,
  amount: z.preprocess(
    (v) => (v === "" ? undefined : v),
    number("Amount").optional(),
  ),
  currency,
  file_url: optionalUrl(),
  status: z.enum(QUOTATION_STATUSES).optional(),
});
export const sampleCreate = z.strictObject({
  product_id: optionalUuid,
  tracking_ref: text(300),
});
export const sampleUpdate = z.strictObject({
  status: z.enum(SAMPLE_STATUSES).optional(),
  tracking_ref: text(300),
});
export const approvalStatus = z.enum(APPROVAL_STATUSES);

/* ── Catalog ──────────────────────────────────────────────────────────── */
export const productCreate = z.strictObject({
  name: req(300, "Name"),
  sku: req(100, "SKU"),
  description: text(10000),
  moq: text(300),
  packaging_details: text(2000),
  certifications: tags,
  tags,
  category: text(200),
  hs_code: text(20),
  /** Names buyers use in other languages ("haldi", "kurkuma"); used to recognise the product in voice notes. */
  aliases: tags,
  is_active: z.boolean().optional(),
});
export const productUpdate = z.strictObject({
  name: req(300, "Name"),
  sku: req(100, "SKU"),
  description: textNull(10000),
  moq: textNull(300),
  packaging_details: textNull(2000),
  certifications: tagsNull,
  tags: tagsNull,
  category: textNull(200),
  hs_code: textNull(20),
  aliases: tagsNull,
  is_active: z.boolean().optional(),
});
export const variantCreate = z.strictObject({
  name: req(300, "Name"),
  sku: req(100, "SKU"),
  attributes: z.record(z.string(), z.unknown()).nullish(),
});
export const collateralCreate = z.strictObject({
  name: req(300, "Name"),
  description: text(10000),
  file_url: requiredUrl(),
  type: z.enum(COLLATERAL_TYPES, { error: "Choose a type" }),
  tags,
});
export const collateralUpdate = z.strictObject({
  name: req(300, "Name"),
  description: textNull(10000),
  file_url: requiredUrl(),
  type: z.enum(COLLATERAL_TYPES),
  tags: tagsNull,
});
export const libraryItemCreate = z.strictObject({
  title: req(300, "Title"),
  content: text(50000),
  file_url: optionalUrl(),
  tags,
});
export const libraryItemUpdate = z.strictObject({
  title: req(300, "Title"),
  content: textNull(50000),
  file_url: optionalUrlNull(),
  tags: tagsNull,
});

/* ── Events / cadences ────────────────────────────────────────────────── */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const endAfterStart = (v: { date?: unknown; end_date?: unknown }) =>
  typeof v.end_date !== "string" ||
  typeof v.date !== "string" ||
  v.end_date >= v.date;
const END_BEFORE_START = {
  message: "The last day can't be before the first day",
  path: ["end_date"],
};
export const eventCreate = z
  .strictObject({
    name: req(300, "Name"),
    date: isoDate,
    end_date: z.preprocess(emptyToUndef, isoDate.optional()),
    location: text(300),
    country: optionalCountry,
    booth: text(100),
    notes: text(4000),
    member_user_ids: z.array(z.uuid()).max(200).optional(),
  })
  .refine(endAfterStart, END_BEFORE_START);
export const eventUpdate = z
  .strictObject({
    name: req(300, "Name"),
    date: isoDate,
    end_date: z.preprocess(emptyToNull, isoDate.nullable()),
    location: textNull(300),
    country: optionalCountryNull,
    booth: textNull(100),
    notes: textNull(4000),
  })
  .refine(endAfterStart, END_BEFORE_START);
/** PUT /events/{id}/members replaces the whole team. */
export const eventMemberIn = z.strictObject({
  user_id: z.uuid(),
  role: z.preprocess(emptyToNull, z.string().trim().max(100).nullish()),
});
export const eventMembersUpdate = z.strictObject({
  members: z.array(eventMemberIn).max(200),
});

const hours = z.preprocess(
  (v) =>
    typeof v === "string" ? (v.trim() === "" ? undefined : Number(v)) : v,
  z
    .number({ error: "Enter a number of hours" })
    .int("Whole hours only")
    .min(0, "Can't be negative")
    .max(8760, "Up to 8760 hours (one year)"),
);
export const cadenceCreate = z.strictObject({
  lead_status: z.enum(LEAD_STATUSES, { error: "Choose a status" }),
  delay_hours: hours,
  message_template_id: req(300, "WhatsApp template ID"),
  email_message_template_id: text(300),
});
export const cadenceUpdate = z.strictObject({
  lead_status: z.enum(LEAD_STATUSES, { error: "Choose a status" }),
  delay_hours: hours,
  message_template_id: req(300, "WhatsApp template ID"),
  email_message_template_id: textNull(300),
});

/* ── Message templates (the text of automated follow-ups) ─────────────── */
const templateKey = z
  .string({ error: "Key is required" })
  .trim()
  .regex(
    /^[a-z0-9][a-z0-9._-]{0,99}$/,
    "Lowercase letters, digits, dots, dashes or underscores, e.g. nudge-followup-1",
  );
const metaTemplateName = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(512, "Keep it under 512 characters")
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, digits and underscores only")
    .nullable(),
);
const templateLanguage = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})?$/, "A language code, e.g. en or en_US");
export const messageTemplateCreate = z
  .strictObject({
    key: templateKey,
    channel: z.enum(["whatsapp", "email"], { error: "Choose a channel" }),
    body: req(4000, "Message"),
    email_subject: textNull(300),
    whatsapp_template_name: metaTemplateName,
    language: templateLanguage,
  })
  .refine((v) => v.channel !== "email" || Boolean(v.email_subject), {
    message: "An email needs a subject",
    path: ["email_subject"],
  })
  .refine((v) => v.channel !== "email" || !v.whatsapp_template_name, {
    message: "Only for WhatsApp messages",
    path: ["whatsapp_template_name"],
  });
/** Key and channel are fixed once created (follow-up rules point at the key). */
export const messageTemplateUpdate = z.strictObject({
  body: req(4000, "Message"),
  email_subject: textNull(300),
  whatsapp_template_name: metaTemplateName,
  language: templateLanguage,
});

/* ── Captures (booth photo + voice note) ───────────────────────────────── */
export const captureCreate = z.strictObject({
  event_id: optionalUuid,
  note: text(4000),
});
export const captureUpdate = z.strictObject({
  event_id: optionalUuidNull,
  note: textNull(4000),
});

/** Owner picker value meaning "explicitly unassigned" (sent as null). Blank leaves it to the API default. */
export const UNASSIGNED = "none";
const ownerChoice = z.preprocess(
  (v) => (v === UNASSIGNED ? null : emptyToUndef(v)),
  z.uuid("Pick someone from the list").nullable().optional(),
);

/**
 * What the rep reviewed. Mirrors CaptureConfirmRequest; blanks are dropped (the API treats them as
 * "not provided"). `owner_id` omitted = the rep who captured it; UNASSIGNED sends null.
 */
export const captureConfirm = z
  .strictObject({
    contact_name: req(300, "Name"),
    contact_phone: optionalPhone,
    contact_email: optionalEmail,
    contact_designation: text(300),
    contact_whatsapp: optionalPhone,
    contact_alternate_phone: optionalPhone,
    account_name: req(300, "Company name"),
    account_domain: text(300),
    account_industry: text(300),
    account_location: text(300),
    account_country: optionalCountry,
    account_website: optionalWebsite(),
    division: text(200),
    product_id: optionalUuid,
    products: z.array(leadProductIn).max(50).optional(),
    quality_tag: optionalEnum(QUALITY_TAGS),
    owner_id: ownerChoice,
    next_follow_up_at: optionalInstant,
    notes: z.array(leadNoteCreate).max(50).optional(),
    lead_resolution: z.enum(["auto", "new", "attach"]),
    lead_id: optionalUuid,
    lead_title: text(200),
    requirement_summary: text(4000),
    // An id, or null for "not from a show". The form leaves it out when unchanged (= keep the capture's own show).
    event_id: optionalUuidNull.optional(),
    content: text(20000),
    request_research: z.boolean().optional(),
    request_first_touch: z.boolean().optional(),
    ...exportDetails,
  })
  .refine(phoneOrEmail("contact_phone", "contact_email"), {
    message: PHONE_OR_EMAIL_MSG,
    path: ["contact_phone"],
  })
  .refine((v) => v.lead_resolution !== "attach" || Boolean(v.lead_id), {
    message: "Choose which lead to add this to",
    path: ["lead_id"],
  });

/* ── Team / keys / org ────────────────────────────────────────────────── */
export const userCreate = z.strictObject({
  name: req(300, "Name"),
  email: z.email("Enter a valid email address").max(320),
  role: z.enum(USER_ROLES, { error: "Choose a role" }),
  division: text(200),
  // Length/strength rules live on the server; its message is shown verbatim.
  password: z.string().min(1, "Enter a password").max(128),
});
export const userUpdate = z.strictObject({
  name: req(300, "Name"),
  role: z.enum(USER_ROLES),
  division: textNull(200),
  is_active: z.boolean(),
});
export const passwordReset = z.strictObject({
  new_password: z.string().min(1, "Enter a password").max(128),
});

export const apiKeyCreate = z.strictObject({
  name: req(300, "Name"),
  scopes: z
    .array(z.enum(GRANTABLE_KEY_SCOPES))
    .min(1, "Pick at least one permission"),
  expires_at: z.preprocess(
    (v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      const d = new Date(`${v}T23:59:59`);
      return Number.isNaN(d.getTime()) ? v : d.toISOString();
    },
    z.iso.datetime({ error: "Choose a valid date" }).optional(),
  ),
});

export const organizationUpdate = z.strictObject({
  name: req(300, "Name"),
  new_lead_gap_hours: z.preprocess(
    (v) => (typeof v === "string" ? Number(v) : v),
    z
      .number({ error: "Enter a number" })
      .int("Whole hours only")
      .min(1, "At least 1 hour")
      .max(87600, "Up to 87,600 hours"),
  ),
  fuzzy_match_threshold: z.preprocess(
    (v) => (typeof v === "string" ? Number(v) : v),
    z
      .number({ error: "Enter a number" })
      .min(50, "Between 50 and 100")
      .max(100, "Between 50 and 100"),
  ),
  assignment_strategy: z.enum(["round_robin", "division"]),
  /** Two-letter country code, or null for the deployment default. */
  default_phone_region: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^[A-Za-z]{2}$/, "Choose a country")
      .transform((v) => v.toUpperCase())
      .nullable(),
  ),
  /** What the company sells and to whom: the research AI uses it to judge product fit. */
  business_description: textNull(4000).optional(),
  website: optionalWebsiteNull().optional(),
  auto_research_new_leads: z.boolean().optional(),
  first_touch_auto_send: z.boolean().optional(),
  /** Who the automation emails: workflow failures, show leads waiting for review, bot hand-offs. */
  error_alert_email: optionalEmailNull.optional(),
  exhibition_reviewer_email: optionalEmailNull.optional(),
  handoff_email: optionalEmailNull.optional(),
});

export const researchRequest = z.strictObject({
  refresh: z.boolean().optional(),
});
