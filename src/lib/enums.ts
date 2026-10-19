import type {
  ApprovalStatus,
  AttachmentKind,
  BuyerType,
  CaptureStatus,
  CollateralType,
  ContactChannel,
  LeadNoteKind,
  LeadProductSource,
  LeadQualityTag,
  LeadSource,
  LeadStatus,
  QuotationStatus,
  RequirementType,
  ResearchStatus,
  SampleRequestStatus,
  TouchpointChannel,
  TouchpointDirection,
  UserRole,
} from "./api/types";

/** Exact values from the API (build guide §8). */
export const LEAD_SOURCES = [
  "website",
  "email",
  "referral",
  "whatsapp",
  "call",
  "tpp",
  "exhibition",
  "in_person",
  "indiamart",
  "alibaba",
] as const satisfies readonly LeadSource[];
export const TOUCHPOINT_CHANNELS = [
  "website",
  "email",
  "whatsapp",
  "call",
  "tpp",
  "exhibition",
  "in_person",
  "indiamart",
  "alibaba",
] as const satisfies readonly TouchpointChannel[];
export const TOUCHPOINT_DIRECTIONS = [
  "inbound",
  "outbound",
] as const satisfies readonly TouchpointDirection[];
export const LEAD_STATUSES = [
  "new",
  "uncontacted",
  "in_conversation",
  "quotation_requested",
  "stale",
  "won",
  "lost",
] as const satisfies readonly LeadStatus[];
export const QUALITY_TAGS = [
  "hot",
  "warm",
  "cold",
] as const satisfies readonly LeadQualityTag[];
export const COLLATERAL_TYPES = [
  "pdf",
  "video",
  "link",
] as const satisfies readonly CollateralType[];
export const USER_ROLES = [
  "exec",
  "manager",
  "admin",
] as const satisfies readonly UserRole[];
export const QUOTATION_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
] as const satisfies readonly QuotationStatus[];
export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const satisfies readonly ApprovalStatus[];
export const SAMPLE_STATUSES = [
  "requested",
  "shipped",
  "delivered",
  "cancelled",
] as const satisfies readonly SampleRequestStatus[];

export const SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website",
  email: "Email",
  referral: "Referral",
  whatsapp: "WhatsApp",
  call: "Call",
  tpp: "Partner (TPP)",
  exhibition: "Exhibition",
  in_person: "In person",
  indiamart: "IndiaMART",
  alibaba: "Alibaba",
};

export const CHANNEL_LABEL: Record<TouchpointChannel, string> = {
  website: "Website",
  email: "Email",
  whatsapp: "WhatsApp",
  call: "Call",
  tpp: "Partner (TPP)",
  exhibition: "Exhibition",
  in_person: "In person",
  indiamart: "IndiaMART",
  alibaba: "Alibaba",
};

export const DIRECTION_LABEL: Record<TouchpointDirection, string> = {
  inbound: "Inbound",
  outbound: "Outbound",
};

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  uncontacted: "Uncontacted",
  in_conversation: "In conversation",
  quotation_requested: "Quotation requested",
  stale: "Stale",
  won: "Won",
  lost: "Lost",
};

export const QUALITY_LABEL: Record<LeadQualityTag, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
};
export const ROLE_LABEL: Record<UserRole, string> = {
  exec: "Exec",
  manager: "Manager",
  admin: "Admin",
};
export const COLLATERAL_LABEL: Record<CollateralType, string> = {
  pdf: "PDF",
  video: "Video",
  link: "Link",
};
export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
};
export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};
export const SAMPLE_LABEL: Record<SampleRequestStatus, string> = {
  requested: "Requested",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Snake/lower value → readable label, for keys the API returns that we have no map for (e.g. "unset"). */
export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export const CAPTURE_STATUSES = [
  "draft",
  "submitted",
  "processing",
  "ready_for_review",
  "failed",
  "confirmed",
  "discarded",
] as const satisfies readonly CaptureStatus[];
export const ATTACHMENT_KINDS = [
  "image",
  "audio",
] as const satisfies readonly AttachmentKind[];

/** Plain wording for the booth: what the rep should understand, not how the pipeline is built. */
export const CAPTURE_LABEL: Record<CaptureStatus, string> = {
  draft: "Not sent",
  submitted: "Reading…",
  processing: "Reading…",
  ready_for_review: "Ready to review",
  failed: "Couldn't read — add details by hand",
  confirmed: "Lead created",
  discarded: "Discarded",
};

/** Statuses where the capture is still open: editable, and Confirm works from any of them. */
export const OPEN_CAPTURE_STATUSES: readonly CaptureStatus[] = [
  "draft",
  "submitted",
  "processing",
  "ready_for_review",
  "failed",
];
export const READING_STATUSES: readonly CaptureStatus[] = [
  "submitted",
  "processing",
];

/**
 * Labels for values that come from the API. A value this build doesn't know yet (the API adds sources
 * and channels over time) shows as readable text instead of a blank or a crash.
 */
export const sourceLabel = (v: string | null | undefined): string => (v ? ((SOURCE_LABEL as Record<string, string>)[v] ?? humanize(v)) : "—");
export const channelLabel = (v: string | null | undefined): string => (v ? ((CHANNEL_LABEL as Record<string, string>)[v] ?? humanize(v)) : "—");

/* ── Export details, notes, products and research (API migration 0007) ── */
export const BUYER_TYPES = [
  "importer",
  "distributor",
  "wholesaler",
  "retailer",
  "brand_owner",
  "manufacturer",
  "trading_agent",
  "horeca",
  "ecommerce",
  "end_user",
  "other",
] as const satisfies readonly BuyerType[];
export const BUYER_TYPE_LABEL: Record<BuyerType, string> = {
  importer: "Importer",
  distributor: "Distributor",
  wholesaler: "Wholesaler",
  retailer: "Retailer",
  brand_owner: "Brand owner / private label",
  manufacturer: "Manufacturer",
  trading_agent: "Trading agent",
  horeca: "Hotels, restaurants, cafés",
  ecommerce: "E-commerce",
  end_user: "End user",
  other: "Other",
};

export const REQUIREMENT_TYPES = [
  "regular_supply",
  "trial_order",
  "one_time_order",
  "private_label",
  "samples_only",
  "price_enquiry",
  "distributorship",
  "other",
] as const satisfies readonly RequirementType[];
export const REQUIREMENT_TYPE_LABEL: Record<RequirementType, string> = {
  regular_supply: "Regular supply",
  trial_order: "Trial order",
  one_time_order: "One-time order",
  private_label: "Private label",
  samples_only: "Samples only",
  price_enquiry: "Price enquiry",
  distributorship: "Distributorship",
  other: "Other",
};

export const CONTACT_CHANNELS = [
  "whatsapp",
  "email",
  "call",
] as const satisfies readonly ContactChannel[];
export const CONTACT_CHANNEL_LABEL: Record<ContactChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  call: "Call",
};

export const LEAD_NOTE_KINDS = [
  "note",
  "conversation_summary",
  "commitment",
] as const satisfies readonly LeadNoteKind[];
export const LEAD_NOTE_KIND_LABEL: Record<LeadNoteKind, string> = {
  note: "Note",
  conversation_summary: "Conversation summary",
  commitment: "Promise",
};

export const LEAD_PRODUCT_SOURCES = [
  "manual",
  "extraction",
  "research",
] as const satisfies readonly LeadProductSource[];
export const LEAD_PRODUCT_SOURCE_LABEL: Record<LeadProductSource, string> = {
  manual: "Added by hand",
  extraction: "Heard in voice note",
  research: "Suggested by research",
};

export const RESEARCH_STATUSES = [
  "requested",
  "processing",
  "completed",
  "failed",
] as const satisfies readonly ResearchStatus[];
export const RESEARCH_STATUS_LABEL: Record<ResearchStatus, string> = {
  requested: "Researching…",
  processing: "Researching…",
  completed: "Researched",
  failed: "Research failed",
};

/** Incoterms offered in the picker. The API accepts free text and upper-cases it. */
export const INCOTERMS = [
  "EXW",
  "FCA",
  "FOB",
  "CFR",
  "CIF",
  "CPT",
  "CIP",
  "DAP",
  "DDP",
] as const;

/** Simple pipeline stages for the leads list (`stage=`); each covers one or more statuses. */
export const LEAD_STAGES = [
  "not_contacted",
  "contacted",
  "quotation_requested",
  "won",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const STAGE_LABEL: Record<LeadStage, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  quotation_requested: "Quotation requested",
  won: "Won",
  lost: "Lost",
};

/** AI score bands (`qualification=`): hot ≥ 70, warm 40–69, cold < 40. */
export const QUALIFICATION_BANDS = ["hot", "warm", "cold", "unscored"] as const;
export type QualificationBand = (typeof QUALIFICATION_BANDS)[number];
export const QUALIFICATION_LABEL: Record<QualificationBand, string> = {
  hot: "Hot (70+)",
  warm: "Warm (40–69)",
  cold: "Cold (under 40)",
  unscored: "Not scored",
};

export const LEAD_SORTS = [
  "created_desc",
  "created_asc",
  "updated_desc",
  "score_desc",
  "score_asc",
  "follow_up_asc",
  "name_asc",
] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];
export const SORT_LABEL: Record<LeadSort, string> = {
  created_desc: "Newest first",
  created_asc: "Oldest first",
  updated_desc: "Recently updated",
  score_desc: "Highest AI score",
  score_asc: "Lowest AI score",
  follow_up_asc: "Next follow-up",
  name_asc: "Name A–Z",
};

/** Region keys from `GET /leads/regions` → readable names (unknown keys are humanized). */
export const REGION_LABEL: Record<string, string> = {
  gcc_middle_east: "GCC & Middle East",
  europe: "Europe",
  north_america: "North America",
  latin_america: "Latin America",
  africa: "Africa",
  south_asia: "South Asia",
  southeast_asia: "Southeast Asia",
  east_asia: "East Asia",
  central_asia: "Central Asia & CIS",
  oceania: "Oceania",
};
export const regionLabel = (v: string | null | undefined): string =>
  v ? (REGION_LABEL[v] ?? humanize(v)) : "—";

export const EVENT_TIMINGS = ["ongoing", "upcoming", "past"] as const;
export type EventTiming = (typeof EVENT_TIMINGS)[number];
export const EVENT_TIMING_LABEL: Record<EventTiming, string> = {
  ongoing: "Happening now",
  upcoming: "Upcoming",
  past: "Past",
};

export const buyerTypeLabel = (v: string | null | undefined): string =>
  v ? ((BUYER_TYPE_LABEL as Record<string, string>)[v] ?? humanize(v)) : "—";
export const requirementTypeLabel = (v: string | null | undefined): string =>
  v
    ? ((REQUIREMENT_TYPE_LABEL as Record<string, string>)[v] ?? humanize(v))
    : "—";
export const contactChannelLabel = (v: string | null | undefined): string =>
  v
    ? ((CONTACT_CHANNEL_LABEL as Record<string, string>)[v] ?? humanize(v))
    : "—";
export const productSourceLabel = (v: string | null | undefined): string =>
  v
    ? ((LEAD_PRODUCT_SOURCE_LABEL as Record<string, string>)[v] ?? humanize(v))
    : "—";
