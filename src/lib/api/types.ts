import type { components } from "./schema";

type S = components["schemas"];

export type Me = S["MeResponse"];
export type Lead = S["LeadRead"];
export type LeadCreate = S["LeadCreate"];
export type LeadUpdate = S["LeadUpdate"];
export type Touchpoint = S["TouchpointRead"];
export type Account = S["AccountRead"];
export type Contact = S["ContactRead"];
export type Product = S["ProductRead"];
export type ProductVariant = S["ProductVariantRead"];
export type Collateral = S["CollateralRead"];
export type LibraryItem = S["LibraryItemRead"];
/** `GET/POST/PATCH /events` return the detail shape (timing + team) since migration 0007. */
export type EventRecord = S["EventDetail"];
export type EventBrief = S["EventBrief"];
export type EventMember = S["EventMemberRead"];
export type EventSummary = S["EventSummary"];
export type CurrentEvents = S["CurrentEventsResponse"];
export type Cadence = S["CadenceRead"];
export type DueLead = S["DueLeadRead"];
export type MessageTemplate = S["MessageTemplateRead"];
export type IgnoredSender = S["IgnoredSenderRead"];
export type Quotation = S["QuotationRead"];
export type SampleRequest = S["SampleRequestRead"];
export type User = S["UserRead"];
export type UserBrief = S["UserBrief"];
export type ApiKey = S["ApiKeyRead"];
export type ApiKeyCreated = S["ApiKeyCreated"];
export type Organization = S["OrganizationRead"];
export type Mailbox = S["MailboxRead"];
export type AuditLog = S["AuditLogRead"];
export type IngestResult = S["LeadIngestResponse"];
export type BulkIngestResult = S["BulkIngestResponse"];
export type BulkProductResult = S["BulkProductResponse"];
export type MatchResult = S["LeadMatchResponse"];
export type OpenLead = S["OpenLeadRead"];
export type ContactBrief = S["ContactBrief"];
export type AccountBrief = S["AccountBrief"];
export type Capture = S["CaptureRead"];
export type CaptureConfirmResult = S["CaptureConfirmResponse"];
export type CaptureSuggestions = S["CaptureSuggestions"];
export type CaptureConfirmDraft = S["CaptureConfirmDraft"];
export type SuggestedProduct = S["SuggestedProduct"];
export type DuplicateCheck = S["DuplicateCheck"];
export type Attachment = S["AttachmentRead"];
export type ExtractionResult = S["ExtractionResult"];
export type LeadListItem = S["LeadListItem"];
export type LeadFacets = S["LeadFacets"];
export type FacetCount = S["FacetCount"];
export type LeadContext = S["LeadContext"];
export type LeadNote = S["LeadNoteRead"];
export type LeadNoteCreate = S["LeadNoteCreate"];
export type LeadProduct = S["LeadProductRead"];
export type LeadProductIn = S["LeadProductIn"];
export type Research = S["ResearchRead"];
export type Outreach = S["OutreachRead"];
export type OutreachDraft = S["OutreachDraft"];
export type ResearchResult = S["ResearchResult"];
export type ProductMatch = S["ProductMatchRead"];

export type LeadStatus = S["LeadStatus"];
export type LeadSource = S["LeadSource"];
export type LeadQualityTag = S["LeadQualityTag"];
export type TouchpointChannel = S["TouchpointChannel"];
export type TouchpointDirection = S["TouchpointDirection"];
export type AccountMatchStatus = S["AccountMatchStatus"];
export type CollateralType = S["CollateralType"];
export type UserRole = S["UserRole"];
export type QuotationStatus = S["QuotationStatus"];
export type ApprovalStatus = S["ApprovalStatus"];
export type SampleRequestStatus = S["SampleRequestStatus"];
export type Permission = S["Permission"];
export type CaptureStatus = S["CaptureStatus"];
export type AttachmentKind = S["AttachmentKind"];
export type BuyerType = S["BuyerType"];
export type RequirementType = S["RequirementType"];
export type ContactChannel = S["ContactChannel"];
export type LeadNoteKind = S["LeadNoteKind"];
export type LeadProductSource = S["LeadProductSource"];
export type ResearchStatus = S["ResearchStatus"];
export type OutreachStatus = S["OutreachStatus"];

/** `/leads/stats` is untyped in the OpenAPI snapshot; this is the shape documented in the build guide. */
export interface LeadStats {
  total_leads: number;
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  by_quality_tag: Record<string, number>;
  by_division: Record<string, number>;
  by_event: Record<string, number>;
  by_product: Record<string, number>;
}

/** `GET /leads/regions`: region key → its ISO country codes (typed as a bare object in OpenAPI). */
export type Regions = Record<string, string[]>;

export interface Page<T> {
  items: T[];
  total: number | null;
}
