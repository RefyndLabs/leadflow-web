// A tiny in-memory stand-in for the Leadflow API, just faithful enough for end-to-end tests:
// login, rotating single-use refresh tokens (reuse revokes the session, like the real API),
// a seeded pipeline, the lead state machine, dedupe-by-phone on ingest, and a call counter so
// tests can prove the frontend never replays a refresh token.
//
//   node e2e/mock-api/server.mjs          (port 4010; MOCK_EXPIRES_IN=seconds to shorten token life)
import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { handlePlatform } from "./platform.mjs";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const EXPIRES_IN = Number(process.env.MOCK_EXPIRES_IN ?? 900);
const EMAIL = "admin@example.com";
const PASSWORD = "correct horse battery staple 1!";

const uid = () => randomUUID();
const now = () => new Date().toISOString();
const ago = (h) => new Date(Date.now() - h * 3600_000).toISOString();

const ORG = { id: uid(), name: "Acme Exports", slug: "acme-exports" };
const ME = {
  id: uid(),
  name: "Ada Admin",
  email: EMAIL,
  role: "admin",
  division: null,
  organization: ORG,
};
const PERMISSIONS = [
  "leads:read",
  "leads:write",
  "leads:ingest",
  "leads:sweep",
  "stats:read",
  "touchpoints:write",
  "quotations:read",
  "quotations:write",
  "quotations:approve",
  "samples:read",
  "samples:write",
  "accounts:read",
  "accounts:write",
  "accounts:delete",
  "contacts:read",
  "contacts:write",
  "contacts:delete",
  "catalog:read",
  "catalog:write",
  "events:read",
  "events:write",
  "cadences:read",
  "cadences:write",
  "users:read",
  "users:write",
  "keys:manage",
  "audit:read",
  "org:read",
  "org:write",
  "captures:read",
  "captures:write",
];

const accounts = [
  {
    id: uid(),
    name: "Rao Textiles Pvt Ltd",
    domain: "raotextiles.com",
    industry: "Textiles",
    location: "Surat, India",
    country: "IN",
    website: "https://raotextiles.com",
    review_status: "confirmed",
    possible_duplicate_of_id: null,
    created_at: ago(200),
  },
  {
    id: uid(),
    name: "Nordic Foods AB",
    domain: null,
    industry: "Food",
    location: "Malmö, Sweden",
    country: "SE",
    website: null,
    review_status: "needs_review",
    possible_duplicate_of_id: null,
    created_at: ago(90),
  },
];
accounts[1].possible_duplicate_of_id = accounts[0].id;
const contacts = [
  {
    id: uid(),
    name: "Asha Rao",
    phone: "+919876543210",
    email: "asha@raotextiles.com",
    designation: "Purchase manager",
    whatsapp: null,
    alternate_phone: null,
    account_id: accounts[0].id,
    created_at: ago(200),
  },
  {
    id: uid(),
    name: "Lars Berg",
    phone: "+46701234567",
    email: null,
    designation: null,
    whatsapp: null,
    alternate_phone: null,
    account_id: accounts[1].id,
    created_at: ago(90),
  },
];
/** Every v2 field a lead carries, so rows look like the real API's. */
const LEAD_V2 = {
  lead_title: null,
  requirement_summary: null,
  buyer_type: null,
  requirement_type: null,
  approx_volume: null,
  packaging_requirement: null,
  destination_market: null,
  samples_requested: null,
  sample_requirement: null,
  expected_timeline: null,
  target_price: null,
  incoterm: null,
  preferred_contact_channel: null,
  next_follow_up_at: null,
  follow_ups_paused: false,
  qualification_score: null,
  qualification_tag: null,
  qualification_confidence: null,
  qualified_at: null,
};
const leads = [
  {
    ...LEAD_V2,
    id: uid(),
    contact_id: contacts[0].id,
    account_id: accounts[0].id,
    source: "website",
    division: "Textiles",
    status: "uncontacted",
    owner_id: null,
    quality_tag: null,
    event_id: null,
    product_id: null,
    lost_reason: null,
    created_at: ago(30),
    updated_at: ago(30),
  },
  {
    ...LEAD_V2,
    id: uid(),
    contact_id: contacts[1].id,
    account_id: accounts[1].id,
    source: "exhibition",
    buyer_type: "importer",
    approx_volume: "2 tonnes",
    next_follow_up_at: ago(24),
    division: null,
    status: "in_conversation",
    owner_id: ME.id,
    quality_tag: "hot",
    event_id: null,
    product_id: null,
    lost_reason: null,
    created_at: ago(70),
    updated_at: ago(5),
  },
];
const touchpoints = new Map([
  [
    leads[1].id,
    [
      {
        id: uid(),
        lead_id: leads[1].id,
        direction: "inbound",
        channel: "exhibition",
        content: "Interested in 2 tonnes of cold-pressed oil.",
        raw_source_ref: null,
        approved_by_user_id: null,
        approved_at: null,
        created_at: ago(70),
      },
      {
        id: uid(),
        lead_id: leads[1].id,
        direction: "outbound",
        channel: "whatsapp",
        content: "Thanks Lars — sending our catalogue now.",
        raw_source_ref: null,
        approved_by_user_id: null,
        approved_at: null,
        created_at: ago(60),
      },
    ],
  ],
]);
// ── captures (booth photo + voice note) ───────────────────────────────────
const captures = new Map();
const files = new Map(); // attachment id -> { data, type }
const attView = (a) =>
  a
    ? {
        id: a.id,
        kind: a.kind,
        content_type: a.type,
        size_bytes: a.data.length,
        width: a.kind === "image" ? 800 : null,
        height: a.kind === "image" ? 600 : null,
        created_at: a.created_at,
      }
    : null;
const capView = (c, full = false) => ({
  event: eventBrief(c.event_id),
  created_by: userBrief(ME.id),
  // Single read of an open capture only, like the API (null in lists and once confirmed/discarded).
  ...(full && !["confirmed", "discarded"].includes(c.status)
    ? (suggestionsFor(c) ?? { suggestions: null, duplicates: duplicateCheck({}, c.id) })
    : { suggestions: null, duplicates: null }),
  id: c.id,
  status: c.status,
  event_id: c.event_id,
  created_by_user_id: ME.id,
  note: c.note,
  card: attView(c.card),
  card_back: attView(c.card_back),
  voice: attView(c.voice),
  extracted: c.extracted,
  extraction_error: c.extraction_error,
  processing_started_at: null,
  lead_id: c.lead_id,
  confirmed_at: c.confirmed_at,
  created_at: c.created_at,
  updated_at: c.updated_at,
});
const EDITABLE = ["draft", "ready_for_review", "failed"];
const day = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const events = [
  {
    id: uid(),
    name: "Gulfood 2026",
    date: "2026-02-15",
    end_date: "2026-02-19",
    location: "Dubai",
    country: "AE",
    booth: null,
    notes: null,
    member_ids: [],
  },
  {
    id: uid(),
    name: "Spice Expo Live",
    date: day(-1),
    end_date: day(2),
    location: "Bengaluru",
    country: "IN",
    booth: "Hall 3, B-12",
    notes: null,
    member_ids: [ME.id],
  },
];
const products = [
  {
    id: uid(),
    name: "Cold-pressed oil",
    sku: "OIL-001",
    description: null,
    moq: "500 kg",
    packaging_details: null,
    certifications: ["ISO 9001"],
    tags: null,
    category: "Oils",
    hs_code: "1515.90",
    aliases: ["tel", "sesame oil"],
    is_active: true,
  },
];
const collaterals = [];
const catalogue = [];
const faqs = [];
const users = [
  { ...ME, is_active: true, last_login_at: now(), created_at: ago(500) },
];
const cadences = [
  {
    id: uid(),
    lead_status: "in_conversation",
    delay_hours: 24,
    message_template_id: "nudge-followup-1",
  },
];

const TRANSITIONS = {
  new: ["uncontacted"],
  uncontacted: ["in_conversation"],
  in_conversation: ["quotation_requested", "stale"],
  quotation_requested: ["in_conversation", "won", "lost"],
  stale: ["in_conversation"],
  won: [],
  lost: [],
};

// ── v2 helpers: events, briefs, notes, products, research ─────────────────
const today = () => new Date().toISOString().slice(0, 10);
const timingOf = (e, on = today()) =>
  (e.end_date ?? e.date) < on ? "past" : e.date > on ? "upcoming" : "ongoing";
const eventView = (e, on) => ({
  id: e.id,
  name: e.name,
  date: e.date,
  end_date: e.end_date ?? null,
  location: e.location ?? null,
  country: e.country ?? null,
  booth: e.booth ?? null,
  notes: e.notes ?? null,
  timing: timingOf(e, on),
  members: (e.member_ids ?? [])
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => ({
      user_id: u.id,
      name: u.name,
      email: u.email,
      role: null,
      is_active: u.is_active,
      added_at: ago(48),
    })),
});
const eventBrief = (id) => {
  const e = events.find((x) => x.id === id);
  return e
    ? {
        id: e.id,
        name: e.name,
        date: e.date,
        end_date: e.end_date ?? null,
        location: e.location ?? null,
        country: e.country ?? null,
        booth: e.booth ?? null,
      }
    : null;
};
const contactBrief = (c) =>
  c
    ? {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        whatsapp: c.whatsapp ?? null,
        alternate_phone: c.alternate_phone ?? null,
        designation: c.designation ?? null,
      }
    : null;
const userBrief = (id) => {
  const u = users.find((x) => x.id === id);
  return u ? { id: u.id, name: u.name } : null;
};
const leadNotes = new Map(); // lead id -> notes
const leadProducts = new Map(); // lead id -> [{ product_id, quantity, note, source }]
const research = new Map(); // lead id -> runs, newest first
const outreach = new Map(); // lead id -> first messages, newest first
const org = {
  business_description: null,
  website: null,
  auto_research_new_leads: false,
  first_touch_auto_send: false,
};
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];
const mailboxView = (address, extra = {}) => ({
  id: uid(),
  provider: "gmail",
  email_address: address,
  status: "active",
  receive_enabled: true,
  is_default_sender: false,
  granted_scopes: SCOPES,
  skip_categories: ["forums", "promotions", "social"],
  last_synced_at: ago(0.1),
  last_error: null,
  last_error_at: null,
  watch_expires_at: null,
  connected_by_user_id: ME.id,
  created_at: ago(48),
  updated_at: ago(1),
  can_receive: true,
  can_send: true,
  ...extra,
});
/** Connected mailboxes (Settings → Email). Google's consent screen is skipped: authorize sends the browser straight back. */
const mailboxes = [mailboxView("sales@acme-exports.example.com", { is_default_sender: true })];
const APP_URL = process.env.MOCK_APP_URL ?? "http://127.0.0.1:3100";
const productsOf = (lead) =>
  (leadProducts.get(lead.id) ?? []).map((lp, i) => {
    const p = products.find((x) => x.id === lp.product_id);
    return {
      product_id: lp.product_id,
      name: p?.name ?? "Unknown",
      sku: p?.sku ?? "",
      category: p?.category ?? null,
      quantity: lp.quantity ?? null,
      note: lp.note ?? null,
      source: lp.source ?? "manual",
      is_primary: i === 0,
    };
  });
const setProducts = (lead, list, source = "manual") => {
  leadProducts.set(
    lead.id,
    list.map((p) => ({
      product_id: p.product_id,
      quantity: p.quantity ?? null,
      note: p.note ?? null,
      source,
    })),
  );
  lead.product_id = list[0]?.product_id ?? null;
};
const addNotes = (lead, notes, author = ME.id) => {
  for (const n of notes ?? []) {
    const note = {
      id: uid(),
      lead_id: lead.id,
      kind: n.kind ?? "note",
      body: n.body,
      author_user_id: author,
      pinned: Boolean(n.pinned),
      due_at: n.due_at ?? null,
      completed_at: null,
      created_at: now(),
      updated_at: now(),
    };
    leadNotes.set(lead.id, [...(leadNotes.get(lead.id) ?? []), note]);
    if (
      note.kind === "commitment" &&
      note.due_at &&
      (!lead.next_follow_up_at || note.due_at < lead.next_follow_up_at)
    )
      lead.next_follow_up_at = note.due_at;
  }
};
const notesOf = (lead) =>
  [...(leadNotes.get(lead.id) ?? [])].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.created_at.localeCompare(a.created_at),
  );
const queueResearch = (lead) => {
  const run = {
    id: uid(),
    lead_id: lead.id,
    status: "requested",
    trigger: "manual",
    requested_by_user_id: ME.id,
    processing_started_at: null,
    completed_at: null,
    error: null,
    score: null,
    quality_tag: null,
    confidence: null,
    result: null,
    created_at: now(),
    updated_at: now(),
  };
  research.set(lead.id, [run, ...(research.get(lead.id) ?? [])]);
  return run;
};
const band = (s) => (s == null ? null : s >= 70 ? "hot" : s >= 40 ? "warm" : "cold");
const OUTREACH_OPEN = ["requested", "drafting", "draft_ready", "approved", "sending"];
const queueOutreach = (lead, trigger = "manual") => {
  const open = (outreach.get(lead.id) ?? []).find((r) => OUTREACH_OPEN.includes(r.status));
  if (open) return open;
  const run = {
    id: uid(),
    lead_id: lead.id,
    status: "requested",
    trigger,
    requested_by_user_id: ME.id,
    instructions: null,
    processing_started_at: null,
    whatsapp_text: null,
    email_subject: null,
    email_body: null,
    draft: null,
    drafted_at: null,
    channel: null,
    send_mode: null,
    approved_by_user_id: null,
    approved_at: null,
    sent_at: null,
    touchpoint_id: null,
    error: null,
    created_at: now(),
    updated_at: now(),
  };
  outreach.set(lead.id, [run, ...(outreach.get(lead.id) ?? [])]);
  return run;
};
const findOutreach = (id) => {
  for (const [leadId, runs] of outreach) {
    const run = runs.find((r) => r.id === id);
    if (run) return { run, lead: leads.find((l) => l.id === leadId) };
  }
  return null;
};

/** Catalogue match: name, SKU and aliases, either way round (so a sentence finds a product). */
function matchProducts(q, limit = 5) {
  const text = String(q ?? "").toLowerCase();
  if (text.trim().length < 2) return [];
  const out = [];
  for (const p of products) {
    if (p.is_active === false) continue;
    const terms = [p.name, p.sku, ...(p.aliases ?? [])].map((t) => t.toLowerCase());
    const hit = terms.find((t) => t.includes(text) || text.includes(t));
    if (hit)
      out.push({
        product: p,
        score: 90,
        matched_on: hit === p.name.toLowerCase() ? "name" : "alias",
        matched_term: hit,
      });
  }
  return out.slice(0, limit);
}

const STAGE_OF = {
  new: "not_contacted",
  uncontacted: "not_contacted",
  in_conversation: "contacted",
  stale: "contacted",
  quotation_requested: "quotation_requested",
  won: "won",
  lost: "lost",
};
const REGIONS = {
  europe: ["SE", "DE", "FR", "NL", "GB"],
  south_asia: ["IN", "LK", "BD"],
  southeast_asia: ["SG", "MY", "TH"],
  gcc_middle_east: ["AE", "SA", "QA"],
};
const regionOf = (c) =>
  c ? (Object.entries(REGIONS).find(([, cs]) => cs.includes(c))?.[0] ?? null) : null;

/** One overview row: the lead plus everything the list shows, so it costs no extra calls. */
const listItem = (l) => {
  const c = contacts.find((x) => x.id === l.contact_id);
  const a = accounts.find((x) => x.id === l.account_id);
  return {
    ...l,
    contact: contactBrief(c),
    account: {
      id: a.id,
      name: a.name,
      country: a.country ?? null,
      region: regionOf(a.country),
      website: a.website ?? null,
    },
    event: eventBrief(l.event_id),
    owner: userBrief(l.owner_id),
    products: productsOf(l).map((p) => p.name),
    last_activity_at: l.updated_at,
    open_commitments: (leadNotes.get(l.id) ?? []).filter(
      (n) => n.kind === "commitment" && !n.completed_at,
    ).length,
    research_status: research.get(l.id)?.[0]?.status ?? null,
  };
};

/**
 * The API's lead filters (same query keys). `skip` leaves one dimension out, the way a facet counts
 * its own options with every *other* filter applied.
 */
function leadFilter(sp) {
  const all = (k) => sp.getAll(k);
  const stages = all("stage");
  const statuses = all("status");
  const events_ = all("event_id");
  const owners = all("owner_id");
  const quals = all("qualification");
  const tags = all("quality_tag");
  const countries = all("country").map((c) => c.toUpperCase());
  const regions = all("region");
  const sources = all("source");
  const productIds = all("product_id");
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const cmin = sp.get("created_from");
  const cmax = sp.get("created_to");
  const fmin = sp.get("follow_up_from");
  const fmax = sp.get("follow_up_to");
  return (l, skip) => {
    const a = accounts.find((x) => x.id === l.account_id);
    const c = contacts.find((x) => x.id === l.contact_id);
    if (skip !== "status" && (stages.length || statuses.length))
      if (!stages.includes(STAGE_OF[l.status]) && !statuses.includes(l.status)) return false;
    if (sources.length && !sources.includes(l.source)) return false;
    if (skip !== "event") {
      if (events_.length && !events_.includes(l.event_id)) return false;
      if (sp.get("has_event") === "false" && l.event_id) return false;
      if (sp.get("has_event") === "true" && !l.event_id) return false;
    }
    if (skip !== "owner" && (owners.length || sp.get("unassigned") === "true"))
      if (!owners.includes(l.owner_id) && !(sp.get("unassigned") === "true" && !l.owner_id))
        return false;
    if (productIds.length && !productsOf(l).some((p) => productIds.includes(p.product_id)))
      return false;
    if (skip !== "quality_tag" && tags.length && !tags.includes(l.quality_tag)) return false;
    if (skip !== "qualification" && quals.length)
      if (!quals.includes(band(l.qualification_score) ?? "unscored")) return false;
    if (skip !== "country" && (countries.length || regions.length))
      if (!countries.includes(a?.country) && !regions.includes(regionOf(a?.country))) return false;
    const t = (v) => new Date(v).getTime();
    if (cmin && t(l.created_at) < t(cmin)) return false;
    if (cmax && t(l.created_at) >= t(cmax)) return false;
    if (sp.get("follow_up_overdue") === "true")
      if (!l.next_follow_up_at || t(l.next_follow_up_at) >= Date.now() || ["won", "lost"].includes(l.status))
        return false;
    if (sp.get("has_follow_up") === "false" && l.next_follow_up_at) return false;
    if (fmin && (!l.next_follow_up_at || t(l.next_follow_up_at) < t(fmin))) return false;
    if (fmax && (!l.next_follow_up_at || t(l.next_follow_up_at) >= t(fmax))) return false;
    const div = sp.get("division");
    if (div && l.division !== div) return false;
    if (q.length >= 2) {
      const hay = [c?.name, c?.email, c?.phone, a?.name, l.lead_title].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };
}

/** The API's duplicate check, cut down: phone / email / WhatsApp → open leads → recommendation. */
function duplicateCheck({ phone, email, whatsapp, company, productIds = [] }, captureId) {
  const matched = [];
  let contact = null;
  if (phone) {
    contact = contacts.find((c) => c.phone && digits(c.phone) === digits(phone)) ?? null;
    if (contact) matched.push("phone");
  }
  if (email) {
    const byEmail = contacts.find(
      (c) => c.email && c.email.toLowerCase() === String(email).toLowerCase(),
    );
    if (byEmail && (!contact || byEmail.id === contact.id)) {
      contact = byEmail;
      matched.push("email");
    }
  }
  if (whatsapp && !contact) {
    contact =
      contacts.find(
        (c) => (c.whatsapp || c.phone) && digits(c.whatsapp || c.phone) === digits(whatsapp),
      ) ?? null;
    if (contact) matched.push("whatsapp");
  }
  const open = contact
    ? leads.filter((l) => l.contact_id === contact.id && !["won", "lost"].includes(l.status))
    : [];
  const account = contact
    ? accounts.find((a) => a.id === contact.account_id)
    : company
      ? accounts.find((a) => a.name.toLowerCase() === String(company).toLowerCase())
      : null;
  const result = {
    contact: contactBrief(contact),
    matched_on: matched,
    conflicting_contact: null,
    open_leads: open.map((l) => ({
      id: l.id,
      title: l.lead_title ?? null,
      requirement_summary: l.requirement_summary ?? null,
      status: l.status,
      source: l.source,
      owner_id: l.owner_id,
      created_at: l.created_at,
      last_activity_at: l.updated_at,
      last_touchpoints: (touchpoints.get(l.id) ?? []).slice(-2).map((t) => ({
        direction: t.direction,
        channel: t.channel,
        content: t.content,
        created_at: t.created_at,
      })),
    })),
    account: account
      ? {
          account_id: account.id,
          name: account.name,
          country: account.country ?? null,
          status: account.review_status ?? "confirmed",
          score: 100,
        }
      : null,
    similar_contacts: [],
    other_captures: [],
    recommended_resolution: "new",
    recommended_lead_id: null,
    recommendation_reason: "No existing contact matches",
    is_likely_duplicate: Boolean(contact),
  };
  if (captureId && phone) {
    result.other_captures = [...captures.values()]
      .filter(
        (c) =>
          c.id !== captureId &&
          !["discarded", "confirmed"].includes(c.status) &&
          c.extracted?.contact_phone &&
          digits(c.extracted.contact_phone.split("/")[0]) === digits(phone),
      )
      .slice(0, 3)
      .map((c) => ({
        capture_id: c.id,
        status: c.status,
        event_id: c.event_id,
        created_by_user_id: ME.id,
        created_at: c.created_at,
        reason: "Same phone number",
      }));
  }
  if (!contact) return result;
  if (open.length === 0) {
    result.recommendation_reason = "Known contact with no open enquiry: start a new lead";
    return result;
  }
  if (productIds.length) {
    const shared = open.find((l) =>
      (leadProducts.get(l.id) ?? []).some((p) => productIds.includes(p.product_id)),
    );
    if (shared) {
      result.recommended_resolution = "attach";
      result.recommended_lead_id = shared.id;
      result.recommendation_reason = "They already have an open enquiry for the same product";
    } else
      result.recommendation_reason =
        "Known contact, but their open enquiries are about other products: start a new lead";
    return result;
  }
  result.recommended_resolution = "attach";
  result.recommended_lead_id = open[0].id;
  result.recommendation_reason = "Known contact with an open enquiry: probably the same conversation";
  return result;
}

/**
 * Request bodies are strict in the API: an unknown field is a 422. Checking against openapi.json here
 * means an e2e run fails if the UI ever sends a field the API doesn't know.
 */
const SPEC = JSON.parse(
  readFileSync(new URL("../../openapi.json", import.meta.url), "utf8"),
).components.schemas;
function strict(schema, body) {
  const allowed = new Set(Object.keys(SPEC[schema]?.properties ?? {}));
  const extra = Object.keys(body ?? {}).filter((k) => !allowed.has(k));
  return extra.length
    ? {
        detail: extra.map((k) => ({
          loc: ["body", k],
          msg: "Extra inputs are not permitted",
          type: "extra_forbidden",
        })),
      }
    : null;
}

const EXPORT_KEYS = [
  "buyer_type",
  "requirement_type",
  "approx_volume",
  "packaging_requirement",
  "destination_market",
  "samples_requested",
  "sample_requirement",
  "expected_timeline",
  "target_price",
  "incoterm",
  "preferred_contact_channel",
];

/**
 * Ingest and capture confirm share this: find or create the account and contact (by phone, then
 * email), then attach to an open lead or start a new one, with products, notes and a first message.
 */
function upsertLead(b, { source, eventId, message, productSource = "manual" }) {
  let contact =
    (b.contact_phone &&
      contacts.find((x) => x.phone && digits(x.phone) === digits(b.contact_phone))) ||
    (b.contact_email &&
      contacts.find(
        (x) => x.email && x.email.toLowerCase() === String(b.contact_email).toLowerCase(),
      )) ||
    null;
  const isNewContact = !contact;
  let account = contact
    ? accounts.find((x) => x.id === contact.account_id)
    : accounts.find((x) => x.name.toLowerCase() === b.account_name.toLowerCase());
  const isNewAccount = !account;
  if (!account) {
    account = {
      id: uid(),
      name: b.account_name,
      domain: b.account_domain ?? null,
      industry: b.account_industry ?? null,
      location: b.account_location ?? null,
      country: b.account_country ? String(b.account_country).toUpperCase() : null,
      website: b.account_website ?? null,
      review_status: "confirmed",
      possible_duplicate_of_id: null,
      created_at: now(),
    };
    accounts.push(account);
  }
  if (!contact) {
    contact = {
      id: uid(),
      name: b.contact_name,
      phone: b.contact_phone ? digits(b.contact_phone) : null,
      email: b.contact_email ?? null,
      designation: b.contact_designation ?? null,
      whatsapp: b.contact_whatsapp ? digits(b.contact_whatsapp) : null,
      alternate_phone: b.contact_alternate_phone ? digits(b.contact_alternate_phone) : null,
      account_id: account.id,
      created_at: now(),
    };
    contacts.push(contact);
  }
  let lead = null;
  if (b.lead_resolution === "attach") lead = leads.find((l) => l.id === b.lead_id) ?? null;
  else if (b.lead_resolution !== "new")
    // auto: an open lead for this contact gets the message
    lead =
      leads.find((l) => l.contact_id === contact.id && !["won", "lost"].includes(l.status)) ??
      null;
  const isNewLead = !lead;
  if (!lead) {
    lead = {
      ...LEAD_V2,
      id: uid(),
      contact_id: contact.id,
      account_id: account.id,
      source,
      division: b.division ?? null,
      status: "uncontacted",
      owner_id: b.owner_id ?? null,
      quality_tag: b.quality_tag ?? null,
      event_id: eventId ?? null,
      product_id: null,
      lost_reason: null,
      lead_title: b.lead_title ?? null,
      requirement_summary: b.requirement_summary ?? null,
      next_follow_up_at: b.next_follow_up_at ?? null,
      created_at: now(),
      updated_at: now(),
    };
    for (const k of EXPORT_KEYS) if (k in b) lead[k] = b[k];
    if (lead.incoterm) lead.incoterm = String(lead.incoterm).toUpperCase();
    leads.unshift(lead);
    if (b.products?.length) setProducts(lead, b.products, productSource);
    else if (b.product_id) setProducts(lead, [{ product_id: b.product_id }]);
  }
  addNotes(lead, b.notes);
  if (message)
    touchpoints.set(lead.id, [
      ...(touchpoints.get(lead.id) ?? []),
      {
        id: uid(),
        lead_id: lead.id,
        raw_source_ref: null,
        approved_by_user_id: null,
        approved_at: null,
        attachments: [],
        content: null,
        ...message,
        created_at: now(),
      },
    ]);
  lead.updated_at = now();
  return {
    lead,
    response: {
      lead_id: lead.id,
      contact_id: contact.id,
      account_id: account.id,
      is_new_lead: isNewLead,
      is_new_contact: isNewContact,
      is_new_account: isNewAccount,
      account_review_status: account.review_status,
      lead_resolution_applied: isNewLead ? "auto_created" : "attach",
      contact_review_status: "none",
      other_matching_contact_id: null,
    },
  };
}

/** What the review screen pre-fills from (the API's `suggestions`), built from the mock extraction. */
function suggestionsFor(c) {
  const x = c.extracted;
  if (!x) return null;
  const numbers = String(x.contact_phone ?? "")
    .split("/")
    .map((n) => n.trim())
    .filter(Boolean);
  const phone = numbers[0] ? digits(numbers[0]) : null;
  const alternate = x.contact_alternate_phone
    ? digits(x.contact_alternate_phone)
    : numbers[1]
      ? digits(numbers[1])
      : null;
  const whatsapp = x.contact_whatsapp ? digits(x.contact_whatsapp) : phone;
  const matches = (x.products_mentioned ?? [])
    .map((m) => ({ m, hit: matchProducts(m.name, 1)[0] }))
    .filter((v) => v.hit);
  const warnings = [];
  if (numbers.length > 2) warnings.push("More than two phone numbers were read: check the primary and the alternate number");
  else if (numbers.length === 2)
    warnings.push("Two phone numbers were read: the first is the primary number, the second the alternate");
  const unmatched = (x.products_mentioned ?? []).filter((m) => !matchProducts(m.name, 1).length);
  if (unmatched.length) warnings.push(`Not in the catalogue: ${unmatched.map((m) => m.name).join(", ")}`);
  const promises = x.conversation?.promises_made ?? [];
  const notes = [];
  if (x.conversation)
    notes.push({
      kind: "conversation_summary",
      body: [
        x.conversation.who_they_are && `Who they are: ${x.conversation.who_they_are}`,
        x.conversation.what_they_need && `What they need: ${x.conversation.what_they_need}`,
        promises.length && `What we promised:\n${promises.map((p) => `- ${p.text}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  for (const p of promises) notes.push({ kind: "commitment", body: p.text, due_at: p.due_at ?? null });
  const productsIn = matches.map(({ m, hit }) => ({
    product_id: hit.product.id,
    quantity: m.quantity ?? null,
    note: null,
  }));
  const dup = duplicateCheck(
    {
      phone,
      email: x.contact_email,
      company: x.account_name,
      productIds: productsIn.map((p) => p.product_id),
    },
    c.id,
  );
  const dueDates = promises.map((p) => p.due_at).filter(Boolean).sort();
  return {
    duplicates: dup,
    suggestions: {
      products: matches.map(({ m, hit }) => ({
        product_id: hit.product.id,
        name: hit.product.name,
        sku: hit.product.sku,
        category: hit.product.category ?? null,
        score: 92,
        matched_on: "mention",
        matched_term: hit.matched_term,
        quantity: m.quantity ?? null,
        note: null,
        mentions: [m.name],
      })),
      confirm_draft: {
        contact_name: x.contact_name ?? null,
        contact_phone: phone,
        contact_email: x.contact_email ?? null,
        contact_designation: x.contact_designation ?? null,
        contact_whatsapp: whatsapp,
        contact_alternate_phone: alternate,
        account_name: x.account_name ?? null,
        account_domain: null,
        account_industry: null,
        account_location: x.account_location ?? null,
        account_country: x.account_country ?? null,
        account_website: x.account_website ?? null,
        division: null,
        buyer_type: x.buyer_type ?? null,
        requirement_type: x.requirement_type ?? null,
        approx_volume: x.approx_volume ?? null,
        packaging_requirement: null,
        destination_market: null,
        samples_requested: x.samples_requested ?? null,
        sample_requirement: null,
        expected_timeline: null,
        target_price: null,
        incoterm: null,
        preferred_contact_channel: null,
        product_id: productsIn[0]?.product_id ?? null,
        products: productsIn.length ? productsIn : null,
        quality_tag: x.quality_tag ?? null,
        owner_id: ME.id,
        next_follow_up_at: dueDates[0] ?? null,
        notes: notes.length ? notes : null,
        lead_resolution:
          dup.recommended_resolution === "attach" && dup.recommended_lead_id ? "attach" : "new",
        lead_id: dup.recommended_resolution === "attach" ? dup.recommended_lead_id : null,
        lead_title: x.lead_title ?? null,
        requirement_summary: x.requirement_summary ?? null,
        event_id: c.event_id,
        content: [x.requirement_summary, x.next_steps && `Next steps: ${x.next_steps}`]
          .filter(Boolean)
          .join("\n\n"),
        request_research: true,
        request_first_touch: true,
      },
      contact_phone_e164: phone,
      contact_whatsapp_e164: whatsapp,
      contact_alternate_phone_e164: alternate,
      phone_country: phone?.startsWith("+65") ? "SG" : null,
      warnings,
    },
  };
}

// ── sessions: single-use rotating refresh tokens ───────────────────────────
const sessions = new Map(); // sid -> { revoked }
const access = new Map(); //  token -> { sid, exp }
const refresh = new Map(); // token -> { sid, used }
const stats = { logins: 0, refreshes: 0, reuseDetected: 0, requests: 0 };

function issue(sid) {
  const at = `at_${randomBytes(24).toString("base64url")}`;
  const rt = `rt_${randomBytes(24).toString("base64url")}`;
  access.set(at, { sid, exp: Date.now() + EXPIRES_IN * 1000 });
  refresh.set(rt, { sid, used: false });
  return {
    access_token: at,
    refresh_token: rt,
    token_type: "bearer",
    expires_in: EXPIRES_IN,
  };
}

function auth(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  const a = m && access.get(m[1]);
  if (!a || a.exp < Date.now() || sessions.get(a.sid)?.revoked) return null;
  return a;
}

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};
const readRaw = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

/** Pulls the single `file` part out of a multipart body: its bytes and declared type. */
function parseMultipart(buf, contentType) {
  const boundary = /boundary=([^;]+)/i.exec(contentType ?? "")?.[1];
  if (!boundary) return null;
  const start = buf.indexOf(Buffer.from("\r\n\r\n"));
  if (start < 0) return null;
  const head = buf.subarray(0, start).toString("latin1");
  const type =
    /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ??
    "application/octet-stream";
  const end = buf.lastIndexOf(Buffer.from(`\r\n--${boundary}`));
  return {
    data: buf.subarray(start + 4, end > start ? end : buf.length),
    type,
  };
}

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(
          chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {},
        );
      } catch {
        resolve(null);
      }
    });
  });

const page = (rows, url) => {
  const skip = Number(url.searchParams.get("skip") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  return { rows: rows.slice(skip, skip + limit), total: rows.length };
};
const list = (res, rows, url) => {
  const { rows: r, total } = page(rows, url);
  json(res, 200, r, { "x-total-count": String(total) });
};

let phoneRegion = null; // organization setting; null = deployment default (IN)
const digits = (p) =>
  parsePhoneNumberFromString(String(p), phoneRegion ?? "IN")?.number ??
  String(p).replace(/\D/g, "");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;
  stats.requests++;

  if (path === "/health") return json(res, 200, { status: "ok" });
  if (path === "/__stats") return json(res, 200, stats);
  // Test hook (mock only): put a lead's research into a given state, e.g. completed with a result.
  let m;
  if ((m = /^\/__research\/([^/]+)$/.exec(path)) && method === "POST") {
    const lead = leads.find((l) => l.id === m[1]);
    if (!lead) return json(res, 404, { detail: "Lead not found" });
    const b = (await readBody(req)) ?? {};
    const run = research.get(lead.id)?.[0] ?? queueResearch(lead);
    Object.assign(run, {
      status: b.status,
      error: b.error ?? null,
      result: b.result ?? null,
      score: b.result?.score ?? null,
      quality_tag: b.result ? (b.result.quality_tag ?? band(b.result.score)) : null,
      confidence: b.result?.confidence ?? null,
      completed_at: b.status === "completed" ? now() : null,
      updated_at: now(),
    });
    if (b.status === "completed" && b.result) {
      lead.qualification_score = b.result.score;
      lead.qualification_tag = run.quality_tag;
      lead.qualification_confidence = run.confidence;
      lead.qualified_at = now();
    }
    return json(res, 200, run);
  }

  // Test hook (mock only): put a lead's first message into a given state, e.g. a written draft.
  if ((m = /^\/__outreach\/([^/]+)$/.exec(path)) && method === "POST") {
    const lead = leads.find((l) => l.id === m[1]);
    if (!lead) return json(res, 404, { detail: "Lead not found" });
    const b = (await readBody(req)) ?? {};
    const run = outreach.get(lead.id)?.[0] ?? queueOutreach(lead);
    Object.assign(run, b, {
      drafted_at: b.status === "draft_ready" ? now() : run.drafted_at,
      updated_at: now(),
    });
    return json(res, 200, run);
  }

  // ── the personalised first message ─────────────────────────────────────
  if ((m = /^\/outreach\/([^/]+)(?:\/(approve|mark-sent|redraft|retry|cancel))?$/.exec(path))) {
    const found = findOutreach(m[1]);
    if (!found) return json(res, 404, { detail: "First message not found" });
    const { run, lead } = found;
    const action = m[2];
    if (!action && method === "GET") return json(res, 200, run);
    const b = (await readBody(req)) ?? {};
    const conflict = () =>
      json(res, 409, { detail: `Cannot do that to a first message that is ${run.status.replace("_", " ")}` });
    const editable = ["draft_ready", "failed"].includes(run.status) && run.drafted_at;
    const applyEdits = () => {
      for (const k of ["whatsapp_text", "email_subject", "email_body"])
        if (k in b) run[k] = b[k] === "" ? null : b[k];
    };
    const hasText = (ch) => (ch === "whatsapp" ? Boolean(run.whatsapp_text) : Boolean(run.email_subject && run.email_body));
    run.updated_at = now();
    if (!action && method === "PATCH") {
      const bad = strict("OutreachEdit", b);
      if (bad) return json(res, 422, bad);
      if (!editable) return conflict();
      applyEdits();
      return json(res, 200, run);
    }
    if (action === "approve") {
      const bad = strict("OutreachApprove", b);
      if (bad) return json(res, 422, bad);
      if (!editable) return conflict();
      applyEdits();
      const contact = contacts.find((c) => c.id === lead.contact_id);
      if (b.channel === "email" ? !contact?.email : !(contact?.whatsapp || contact?.phone))
        return json(res, 422, { detail: "The contact can't be reached on that channel" });
      if (!hasText(b.channel)) return json(res, 422, { detail: "There is no message to send" });
      Object.assign(run, { status: "approved", channel: b.channel, send_mode: "auto", approved_by_user_id: ME.id, approved_at: now(), error: null });
      return json(res, 200, run);
    }
    if (action === "mark-sent") {
      const bad = strict("OutreachManualSend", b);
      if (bad) return json(res, 422, bad);
      if (!(editable || (run.status === "approved" && run.drafted_at))) return conflict();
      applyEdits();
      if (!hasText(b.channel)) return json(res, 422, { detail: "There is no message to send" });
      const tp = {
        id: uid(),
        lead_id: lead.id,
        direction: "outbound",
        channel: b.channel,
        content:
          b.channel === "whatsapp" ? run.whatsapp_text : `Subject: ${run.email_subject}

${run.email_body}`,
        raw_source_ref: null,
        approved_by_user_id: ME.id,
        approved_at: now(),
        attachments: [],
        created_at: now(),
      };
      touchpoints.set(lead.id, [...(touchpoints.get(lead.id) ?? []), tp]);
      if (lead.status === "uncontacted") lead.status = "in_conversation";
      lead.updated_at = now();
      Object.assign(run, { status: "sent", channel: b.channel, send_mode: "manual", sent_at: now(), touchpoint_id: tp.id, approved_by_user_id: ME.id, approved_at: now() });
      return json(res, 200, run);
    }
    if (action === "redraft") {
      if (!editable) return conflict();
      Object.assign(run, { status: "requested", instructions: b.instructions ?? null, whatsapp_text: null, email_subject: null, email_body: null, draft: null, drafted_at: null, channel: null, error: null });
      return json(res, 200, run);
    }
    if (action === "retry") {
      if (run.status !== "failed") return conflict();
      run.status = run.drafted_at ? (run.approved_at ? "approved" : "draft_ready") : "requested";
      run.error = null;
      return json(res, 200, run);
    }
    if (action === "cancel") {
      if (["sending", "sent", "cancelled"].includes(run.status)) return conflict();
      run.status = "cancelled";
      return json(res, 200, run);
    }
    return json(res, 405, { detail: "Method not allowed" });
  }

  if (path === "/auth/login" && method === "POST") {
    const b = await readBody(req);
    if (b?.email !== EMAIL || b?.password !== PASSWORD)
      return json(res, 401, { detail: "Invalid credentials" });
    stats.logins++;
    const sid = uid();
    sessions.set(sid, { revoked: false });
    return json(res, 200, issue(sid));
  }
  if (path === "/auth/refresh" && method === "POST") {
    stats.refreshes++;
    const b = await readBody(req);
    const r = b?.refresh_token && refresh.get(b.refresh_token);
    if (!r || sessions.get(r.sid)?.revoked)
      return json(res, 401, { detail: "Invalid credentials" });
    if (r.used) {
      stats.reuseDetected++;
      sessions.get(r.sid).revoked = true; // theft: the whole session dies
      return json(res, 401, { detail: "Invalid credentials" });
    }
    r.used = true;
    return json(res, 200, issue(r.sid));
  }

  if (await handlePlatform(req, res, path, method, url, { json, readBody })) return;

  const a = auth(req);
  if (!a) return json(res, 401, { detail: "Not authenticated" });

  if (path === "/auth/me")
    return json(res, 200, { ...ME, permissions: PERMISSIONS });
  if (path === "/auth/logout" || path === "/auth/logout-all") {
    sessions.get(a.sid).revoked = true;
    return json(res, 204);
  }

  if (path === "/leads/stats") {
    const by = (key) =>
      leads.reduce(
        (m, l) => ((m[l[key] ?? "unset"] = (m[l[key] ?? "unset"] ?? 0) + 1), m),
        {},
      );
    return json(res, 200, {
      total_leads: leads.length,
      by_status: by("status"),
      by_source: by("source"),
      by_quality_tag: by("quality_tag"),
      by_division: by("division"),
      by_event: by("event_id"),
      by_product: by("product_id"),
    });
  }
  if (path === "/leads/match") {
    const phone = url.searchParams.get("phone");
    const c = phone
      ? contacts.find((x) => x.phone && digits(x.phone) === digits(phone))
      : null;
    const open = c
      ? leads.filter(
          (l) => l.contact_id === c.id && !["won", "lost"].includes(l.status),
        )
      : [];
    return json(res, 200, {
      contact_id: c?.id ?? null,
      contact: c
        ? { id: c.id, name: c.name, phone: c.phone, email: c.email }
        : null,
      account_id: c?.account_id ?? null,
      account_match_status: c ? "confirmed" : "none",
      account_match_score: c ? 100 : 0,
      open_leads: open.map((l) => ({
        id: l.id,
        title: l.lead_title ?? null,
        requirement_summary: l.requirement_summary ?? null,
        status: l.status,
        source: l.source,
        owner_id: l.owner_id,
        created_at: l.created_at,
        last_activity_at: l.updated_at,
        last_touchpoints: (touchpoints.get(l.id) ?? []).slice(-2).map((t) => ({
          direction: t.direction,
          channel: t.channel,
          content: t.content,
          created_at: t.created_at,
        })),
      })),
    });
  }
  if (path === "/leads/ingest" && method === "POST") {
    const b = await readBody(req);
    const bad = strict("LeadIngestRequest", b);
    if (bad) return json(res, 422, bad);
    if (!b?.contact_name || !b?.account_name || !b?.source || !(b.contact_phone || b.contact_email))
      return json(res, 422, {
        detail: [{ loc: ["body", "contact_name"], msg: "Field required" }],
      });
    const out = upsertLead(b, {
      source: b.source,
      eventId: b.event_id ?? null,
      message: b.touchpoint ?? null,
    });
    return json(res, 201, out.response);
  }
  if (path === "/leads/duplicates") {
    const sp = url.searchParams;
    return json(
      res,
      200,
      duplicateCheck({
        phone: sp.get("phone"),
        email: sp.get("email"),
        whatsapp: sp.get("whatsapp"),
        company: sp.get("company"),
        productIds: sp.getAll("product_id"),
      }),
    );
  }
  if (path === "/leads/regions") return json(res, 200, REGIONS);
  if (path === "/leads/overview" || path === "/leads/facets") {
    const f = leadFilter(url.searchParams);
    if (path === "/leads/facets") {
      const count = (skip, key, label) => {
        const m = new Map();
        for (const l of leads.filter((x) => f(x, skip))) {
          const v = key(l);
          m.set(v, (m.get(v) ?? 0) + 1);
        }
        return [...m].map(([value, n]) => ({ value, label: label(value), count: n }));
      };
      const acct = (l) => accounts.find((a) => a.id === l.account_id);
      return json(res, 200, {
        total: leads.filter((x) => f(x)).length,
        stage: count("status", (l) => STAGE_OF[l.status], (v) => v),
        status: count("status", (l) => l.status, (v) => v),
        event: count("event", (l) => l.event_id, (v) => (v ? eventBrief(v)?.name : "Not from an exhibition")),
        country: count("country", (l) => acct(l)?.country ?? null, (v) => v ?? "Unknown"),
        region: count("country", (l) => regionOf(acct(l)?.country), (v) => v ?? "Unknown"),
        qualification: count("qualification", (l) => band(l.qualification_score) ?? "unscored", (v) => v),
        quality_tag: count("quality_tag", (l) => l.quality_tag, (v) => v ?? "Not rated"),
        owner: count("owner", (l) => l.owner_id, (v) => (v ? (userBrief(v)?.name ?? "Teammate") : "Unassigned")),
      });
    }
    const rows = leads.filter((x) => f(x));
    const sort = url.searchParams.get("sort");
    if (sort === "name_asc")
      rows.sort((x, y) =>
        contacts.find((c) => c.id === x.contact_id).name.localeCompare(contacts.find((c) => c.id === y.contact_id).name),
      );
    if (sort === "created_asc") rows.sort((x, y) => x.created_at.localeCompare(y.created_at));
    return list(res, rows.map(listItem), url);
  }
  if (path === "/leads" && method === "GET") {
    let rows = leads;
    for (const k of [
      "status",
      "source",
      "quality_tag",
      "owner_id",
      "event_id",
      "product_id",
      "division",
    ]) {
      const v = url.searchParams.get(k);
      if (v) rows = rows.filter((l) => l[k] === v);
    }
    return list(res, rows, url);
  }

  if (
    (m =
      /^\/leads\/([^/]+)(?:\/(context|status|score|assign|touchpoints|quotations|sample-requests|notes|products|research|first-touch|outreach)(?:\/([^/]+))?)?$/.exec(
        path,
      ))
  ) {
    const lead = leads.find((l) => l.id === m[1]);
    if (!lead) return json(res, 404, { detail: "Lead not found" });
    const sub = m[2];
    if (!sub && method === "PATCH") {
      const b = (await readBody(req)) ?? {};
      const bad = strict("LeadUpdate", b);
      if (bad) return json(res, 422, bad);
      Object.assign(lead, b, { updated_at: now() });
      if (lead.incoterm) lead.incoterm = String(lead.incoterm).toUpperCase();
      return json(res, 200, lead);
    }
    if (!sub) return json(res, 200, lead);
    if (sub === "context") {
      const contact = contacts.find((c) => c.id === lead.contact_id);
      const account = accounts.find((a) => a.id === lead.account_id) ?? null;
      return json(res, 200, {
        lead,
        contact: contactBrief(contact),
        account,
        event: eventBrief(lead.event_id),
        owner: userBrief(lead.owner_id),
        products: productsOf(lead),
        notes: notesOf(lead),
        touchpoints: (touchpoints.get(lead.id) ?? []).map((t) => ({
          attachments: [],
          ...t,
        })),
        captures: [...captures.values()].filter((c) => c.lead_id === lead.id).map((c) => capView(c)),
        research: research.get(lead.id)?.[0] ?? null,
        outreach: outreach.get(lead.id)?.[0] ?? null,
        last_activity_at: lead.updated_at,
      });
    }
    if (sub === "quotations" || sub === "sample-requests")
      return json(res, 200, []);
    if (sub === "products") {
      if (method === "PUT") {
        const b = (await readBody(req)) ?? {};
        const bad = strict("LeadProductsUpdate", b);
        if (bad) return json(res, 422, bad);
        if (b.products?.some((p) => !products.some((x) => x.id === p.product_id)))
          return json(res, 422, { detail: "Unknown product(s)" });
        setProducts(lead, b.products ?? []);
      }
      return json(res, 200, productsOf(lead));
    }
    if (sub === "notes") {
      const noteId = m[3];
      if (!noteId && method === "GET") return json(res, 200, notesOf(lead));
      if (!noteId && method === "POST") {
        const b = (await readBody(req)) ?? {};
        const bad = strict("LeadNoteCreate", b);
        if (bad) return json(res, 422, bad);
        addNotes(lead, [b]);
        return json(res, 201, (leadNotes.get(lead.id) ?? []).at(-1));
      }
      const note = (leadNotes.get(lead.id) ?? []).find((n) => n.id === noteId);
      if (!note) return json(res, 404, { detail: "Note not found" });
      if (method === "DELETE") {
        leadNotes.set(lead.id, (leadNotes.get(lead.id) ?? []).filter((n) => n.id !== noteId));
        return json(res, 204);
      }
      const b = (await readBody(req)) ?? {};
      const bad = strict("LeadNoteUpdate", b);
      if (bad) return json(res, 422, bad);
      if ("body" in b) note.body = b.body;
      if ("pinned" in b) note.pinned = b.pinned;
      if ("due_at" in b) note.due_at = b.due_at;
      if ("completed" in b) note.completed_at = b.completed ? now() : null;
      note.updated_at = now();
      return json(res, 200, note);
    }
    if (sub === "outreach") return json(res, 200, outreach.get(lead.id) ?? []);
    if (sub === "first-touch") {
      const b = (await readBody(req)) ?? {};
      const bad = strict("OutreachRequest", b);
      if (bad) return json(res, 422, bad);
      const latest = (outreach.get(lead.id) ?? [])[0];
      if (latest && (OUTREACH_OPEN.includes(latest.status) || !b.again)) return json(res, 200, latest);
      const run = queueOutreach(lead, latest ? "again" : "manual");
      run.instructions = b.instructions ?? null;
      return json(res, 201, run);
    }
    if (sub === "research") {
      const runs = research.get(lead.id) ?? [];
      if (method === "GET") return json(res, 200, runs);
      const b = (await readBody(req)) ?? {};
      const bad = strict("ResearchRequest", b);
      if (bad) return json(res, 422, bad);
      const latest = runs[0];
      if (
        latest &&
        (["requested", "processing"].includes(latest.status) ||
          (latest.status === "completed" && !b.refresh))
      )
        return json(res, 200, latest);
      return json(res, 201, queueResearch(lead));
    }
    const b = await readBody(req);
    if (sub === "status") {
      if (!TRANSITIONS[lead.status]?.includes(b.status))
        return json(res, 409, {
          detail: `Cannot move from ${lead.status} to ${b.status}`,
        });
      if (b.status === "lost" && !b.reason)
        return json(res, 422, {
          detail: [
            { loc: ["body", "reason"], msg: "Value error, reason is required" },
          ],
        });
      lead.status = b.status;
      lead.lost_reason = b.reason ?? null;
      lead.updated_at = now();
      return json(res, 200, lead);
    }
    if (sub === "score") {
      lead.quality_tag = b.quality_tag;
      return json(res, 200, lead);
    }
    if (sub === "assign") {
      lead.owner_id = b.owner_id;
      return json(res, 200, lead);
    }
    if (sub === "touchpoints") {
      const tp = {
        id: uid(),
        lead_id: lead.id,
        raw_source_ref: null,
        approved_by_user_id: null,
        approved_at: null,
        content: null,
        ...b,
        created_at: now(),
      };
      touchpoints.set(lead.id, [...(touchpoints.get(lead.id) ?? []), tp]);
      if (b.direction === "outbound" && lead.status === "uncontacted")
        lead.status = "in_conversation";
      if (b.direction === "inbound" && lead.status === "stale")
        lead.status = "in_conversation";
      lead.updated_at = now();
      return json(res, 201, tp);
    }
  }

  // ── captures ──────────────────────────────────────────────────────────
  if (path === "/captures" && method === "GET") {
    let rows = [...captures.values()].sort((x, y) =>
      y.created_at.localeCompare(x.created_at),
    );
    for (const k of ["status", "event_id"]) {
      const v = url.searchParams.get(k);
      if (v) rows = rows.filter((c) => c[k] === v);
    }
    const by = url.searchParams.get("created_by_user_id");
    if (by) rows = rows.filter(() => by === ME.id);
    return list(res, rows.map(capView), url);
  }
  if (path === "/captures" && method === "POST") {
    const b = (await readBody(req)) ?? {};
    const c = {
      id: uid(),
      status: "draft",
      event_id: b.event_id ?? null,
      note: b.note ?? null,
      card: null,
      card_back: null,
      voice: null,
      extracted: null,
      extraction_error: null,
      lead_id: null,
      confirmed_at: null,
      created_at: now(),
      updated_at: now(),
    };
    captures.set(c.id, c);
    return json(res, 201, capView(c));
  }
  if (
    (m = /^\/captures\/([^/]+)(?:\/(card|card-back|voice|submit|discard|confirm|duplicates))?$/.exec(
      path,
    ))
  ) {
    const c = captures.get(m[1]);
    if (!c) return json(res, 404, { detail: "Capture not found" });
    const sub = m[2];
    c.updated_at = now();
    if (!sub && method === "GET") return json(res, 200, capView(c, true));
    if (sub === "duplicates") {
      // Omitted values fall back to the extraction, like the API.
      const sp = url.searchParams;
      const x = c.extracted ?? {};
      const pick = (k, fallback) => sp.get(k) ?? fallback ?? null;
      return json(
        res,
        200,
        duplicateCheck(
          {
            phone: pick("phone", x.contact_phone?.split("/")[0]?.trim()),
            email: pick("email", x.contact_email),
            whatsapp: pick("whatsapp"),
            company: pick("company", x.account_name),
            productIds: sp.getAll("product_id"),
          },
          c.id,
        ),
      );
    }
    if (!sub && method === "PATCH") {
      if (!EDITABLE.includes(c.status))
        return json(res, 409, {
          detail: "This capture can no longer be edited.",
        });
      const b = (await readBody(req)) ?? {};
      if ("event_id" in b) c.event_id = b.event_id;
      if ("note" in b) c.note = b.note;
      c.status = "draft";
      return json(res, 200, capView(c));
    }
    if (sub === "card" || sub === "card-back" || sub === "voice") {
      // "card" is the front; "card-back" the optional back. Both follow the same rules.
      const slot = sub === "card-back" ? "card_back" : sub;
      const photo = sub !== "voice";
      if (sub === "card-back" && method === "DELETE") {
        // Like the API: only while editable, and the capture goes back to draft with the reading cleared.
        if (!EDITABLE.includes(c.status))
          return json(res, 409, {
            detail: "This capture can no longer be edited.",
          });
        c.card_back = null;
        c.status = "draft";
        c.extracted = null;
        c.extraction_error = null;
        return json(res, 204);
      }
      if (method === "DELETE") {
        c[sub] = null;
        return json(res, 204);
      }
      if (!EDITABLE.includes(c.status))
        return json(res, 409, {
          detail: "This capture can no longer be edited.",
        });
      const raw = await readRaw(req);
      const part = parseMultipart(raw, req.headers["content-type"]);
      if (!part || part.data.length === 0)
        return json(res, 422, { detail: "That file was empty." });
      if (photo && !/^image\/(jpeg|png|webp|gif|bmp)$/.test(part.type))
        return json(res, 415, { detail: "Use a JPEG, PNG or WebP image." });
      if (sub === "voice" && !part.type.startsWith("audio/"))
        return json(res, 415, {
          detail: "That doesn't look like an audio recording.",
        });
      stats.uploads = (stats.uploads ?? 0) + 1;
      if (process.env.MOCK_FAIL_FIRST_UPLOAD === "1" && stats.uploads === 1)
        return json(res, 503, { detail: "temporarily unavailable" });
      const a = {
        id: uid(),
        kind: photo ? "image" : "audio",
        type: photo ? "image/jpeg" : part.type,
        data: part.data,
        created_at: now(),
      };
      files.set(a.id, a);
      c[slot] = a;
      c.status = "draft";
      if (sub === "card-back") {
        c.extracted = null;
        c.extraction_error = null;
      }
      return json(res, 200, capView(c));
    }
    if (sub === "submit" && method === "POST") {
      if (!c.card && !c.card_back && !c.voice)
        return json(res, 422, { detail: "Add a photo or a voice note first." });
      c.status = "submitted";
      setTimeout(
        () => {
          if (c.status !== "submitted") return;
          c.status = "ready_for_review";
          c.extracted = {
            contact_name: "Mr Lee",
            contact_phone: "+65 9123 4567 / +65 6123 0000",
            contact_email: null,
            contact_designation: "Director",
            account_name: "Lee Trading Pte Ltd",
            account_location: "Singapore",
            lead_title: "Cotton yarn 30s combed",
            requirement_summary: "10 tons a month",
            next_steps: "Send a quote",
            card_text: "Lee Trading Pte Ltd\nMr Lee, Director",
            card_back_text: c.card_back
              ? "李贸易私人有限公司\n10 Anson Road, Singapore"
              : null,
            transcript: "Unhe har mahine das ton tel chahiye, aur thoda kesar bhi.",
            transcript_language: "hi",
            transcript_english:
              "He needs about ten tons of oil every month, and some saffron too.",
            account_country: "SG",
            buyer_type: "distributor",
            requirement_type: "regular_supply",
            approx_volume: "10 tons a month",
            quality_tag: "warm",
            products_mentioned: [
              { name: "cold-pressed oil", quantity: "10 t / month" },
              { name: "saffron" },
            ],
            conversation: {
              who_they_are: "Director of a Singapore food distributor.",
              what_they_need: "About ten tons of cold-pressed oil a month.",
              promises_made: [
                {
                  text: "Send a price list and COA",
                  due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
                },
              ],
              summary: null,
              glossary: { tel: "oil", kesar: "saffron" },
            },
            confidence: { contact_name: 0.97, account_name: 0.4 },
          };
          c.updated_at = now();
        },
        Number(process.env.MOCK_READ_MS ?? 1500),
      );
      return json(res, 200, capView(c));
    }
    if (sub === "discard" && method === "POST") {
      c.status = "discarded";
      c.card = null;
      c.card_back = null;
      c.voice = null;
      return json(res, 200, capView(c));
    }
    if (sub === "confirm" && method === "POST") {
      if (c.status === "confirmed")
        return json(res, 409, {
          detail: "This capture was already confirmed.",
        });
      const b = (await readBody(req)) ?? {};
      if (
        !b.contact_name ||
        !b.account_name ||
        (!b.contact_phone && !b.contact_email)
      )
        return json(res, 422, {
          detail: [
            {
              loc: ["body", "contact_phone"],
              msg: "Value error, A phone or an email is required",
            },
          ],
        });
      const bad = strict("CaptureConfirmRequest", b);
      if (bad) return json(res, 422, bad);
      if (b.owner_id && !users.some((u) => u.id === b.owner_id && u.is_active))
        return json(res, 422, { detail: "Cannot assign to an inactive user" });
      if (b.products?.some((p) => !products.some((x) => x.id === p.product_id)))
        return json(res, 422, { detail: "Unknown product(s)" });
      // omitted = keep the capture's show; null = not from a show; an id = set it
      const eventId = "event_id" in b ? b.event_id : c.event_id;
      const origin = eventId ? "exhibition" : "in_person";
      const out = upsertLead(
        {
          ...b,
          // omitted owner = the rep who captured it; null = unassigned
          owner_id: "owner_id" in b ? b.owner_id : ME.id,
          lead_resolution: b.lead_resolution === "attach" ? "attach" : "new",
        },
        {
          source: origin,
          eventId,
          message: {
            direction: "inbound",
            channel: origin,
            content: b.content ?? null,
            attachments: [c.card, c.card_back, c.voice].filter(Boolean).map(attView),
          },
          productSource: "extraction",
        },
      );
      const run = b.request_research === false ? null : queueResearch(out.lead);
      const firstTouch =
        b.request_first_touch !== false && out.response.is_new_lead
          ? queueOutreach(out.lead, "capture")
          : null;
      c.status = "confirmed";
      c.lead_id = out.lead.id;
      c.confirmed_at = now();
      return json(res, 200, {
        capture: capView(c),
        lead: out.response,
        redirect_lead_id: out.lead.id,
        research_id: run?.id ?? null,
        outreach_id: firstTouch?.id ?? null,
      });
    }
  }
  if ((m = /^\/attachments\/([^/]+)\/content$/.exec(path))) {
    const f = files.get(m[1]);
    if (!f) return json(res, 404, { detail: "Not found" });
    stats.downloads = (stats.downloads ?? 0) + 1;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range) {
      const s0 = range[1] ? Number(range[1]) : 0;
      const e0 = range[2]
        ? Math.min(Number(range[2]), f.data.length - 1)
        : f.data.length - 1;
      res.writeHead(206, {
        "content-type": f.type,
        "content-range": `bytes ${s0}-${e0}/${f.data.length}`,
        "content-length": e0 - s0 + 1,
        "accept-ranges": "bytes",
      });
      return res.end(f.data.subarray(s0, e0 + 1));
    }
    res.writeHead(200, {
      "content-type": f.type,
      "content-length": f.data.length,
      "accept-ranges": "bytes",
    });
    return res.end(f.data);
  }

  // ── exhibitions ─────────────────────────────────────────────────────────
  if (path === "/events/current") {
    const on = url.searchParams.get("on") ?? today();
    const running = events.filter((e) => timingOf(e, on) === "ongoing");
    const mine = running.filter((e) => (e.member_ids ?? []).includes(ME.id));
    const ordered = [...mine, ...running.filter((e) => !mine.includes(e))];
    const suggested = mine.length === 1 ? mine[0] : running.length === 1 ? running[0] : null;
    return json(res, 200, {
      on,
      events: ordered.map((e) => eventView(e, on)),
      suggested_event_id: suggested?.id ?? null,
    });
  }
  if (path === "/events" && method === "GET") {
    const on = url.searchParams.get("on") ?? today();
    const timing = url.searchParams.get("timing");
    let rows = [...events].sort((x, y) => y.date.localeCompare(x.date));
    if (timing) rows = rows.filter((e) => timingOf(e, on) === timing);
    if (url.searchParams.get("mine") === "true")
      rows = rows.filter((e) => (e.member_ids ?? []).includes(ME.id));
    return list(res, rows.map((e) => eventView(e, on)), url);
  }
  if (path === "/events" && method === "POST") {
    const b = (await readBody(req)) ?? {};
    const bad = strict("EventCreate", b);
    if (bad) return json(res, 422, bad);
    if (b.end_date && b.end_date < b.date)
      return json(res, 422, { detail: "end_date can't be before date" });
    const e = {
      id: uid(),
      name: b.name,
      date: b.date,
      end_date: b.end_date ?? null,
      location: b.location ?? null,
      country: b.country ? String(b.country).toUpperCase() : null,
      booth: b.booth ?? null,
      notes: b.notes ?? null,
      member_ids: b.member_user_ids ?? [],
    };
    events.push(e);
    return json(res, 201, eventView(e));
  }
  if ((m = /^\/events\/([^/]+)(?:\/(members|summary))?$/.exec(path))) {
    const e = events.find((x) => x.id === m[1]);
    if (!e) return json(res, 404, { detail: "Exhibition not found" });
    if (m[2] === "summary") {
      const evLeads = leads.filter((l) => l.event_id === e.id);
      const evCaps = [...captures.values()].filter((c) => c.event_id === e.id);
      const by = (rows, key) =>
        rows.reduce((acc, r) => ((acc[key(r)] = (acc[key(r)] ?? 0) + 1), acc), {});
      return json(res, 200, {
        event: eventView(e),
        total_leads: evLeads.length,
        leads_by_status: by(evLeads, (l) => l.status),
        leads_by_quality: by(evLeads, (l) => l.quality_tag ?? "unset"),
        captures_by_status: by(evCaps, (c) => c.status),
        captures_to_review: evCaps.filter((c) => c.status === "ready_for_review").length,
        by_member: [{ user_id: ME.id, name: ME.name, captures: evCaps.length, leads: evLeads.length }],
      });
    }
    if (m[2] === "members" && method === "PUT") {
      const b = (await readBody(req)) ?? {};
      const bad = strict("EventMembersUpdate", b);
      if (bad) return json(res, 422, bad);
      e.member_ids = (b.members ?? []).map((x) => x.user_id);
      return json(res, 200, eventView(e));
    }
    if (method === "PATCH") {
      const b = (await readBody(req)) ?? {};
      const bad = strict("EventUpdate", b);
      if (bad) return json(res, 422, bad);
      Object.assign(e, b);
      if (e.country) e.country = String(e.country).toUpperCase();
      return json(res, 200, eventView(e));
    }
    if (method === "DELETE") {
      if ([...captures.values()].some((c) => c.event_id === e.id))
        return json(res, 409, { detail: "Captures are tagged to this exhibition." });
      events.splice(events.indexOf(e), 1);
      return json(res, 204);
    }
    return json(res, 200, eventView(e));
  }

  // ── catalogue ───────────────────────────────────────────────────────────
  if (path === "/products/match")
    return json(
      res,
      200,
      matchProducts(url.searchParams.get("q"), Number(url.searchParams.get("limit") ?? 5)),
    );
  if (path === "/products/categories")
    return json(res, 200, [...new Set(products.map((p) => p.category).filter(Boolean))].sort());
  if (path === "/products" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const cat = url.searchParams.get("category");
    const active = url.searchParams.get("active");
    const rows = products.filter(
      (p) =>
        (!q || [p.name, p.sku, ...(p.aliases ?? [])].some((t) => t.toLowerCase().includes(q))) &&
        (!cat || p.category === cat) &&
        (active === null || String(p.is_active !== false) === active),
    );
    return list(res, rows, url);
  }

  const simple = {
    "/contacts": contacts,
    "/accounts": accounts,
    "/events": events,
    "/products": products,
    "/cadences": cadences,
    "/message-templates": [],
    "/ignored-senders": [],
    "/users": users,
    "/collaterals": collaterals,
    "/catalogue": catalogue,
    "/faqs": faqs,
  };
  if (method === "GET" && simple[path]) return list(res, simple[path], url);
  if (
    method === "GET" &&
    (m = /^\/(contacts|accounts|events|products|users)\/([^/]+)$/.exec(path))
  ) {
    const row = simple[`/${m[1]}`].find((x) => x.id === m[2]);
    return row ? json(res, 200, row) : json(res, 404, { detail: "Not found" });
  }
  if (path === "/cadences/due")
    return json(res, 200, [{ lead: leads[1], cadence: cadences[0] }]);
  if (path === "/organization" && method === "PATCH") {
    const b = (await readBody(req)) ?? {};
    if ("default_phone_region" in b) {
      if (
        b.default_phone_region !== null &&
        !/^[A-Z]{2}$/.test(b.default_phone_region)
      )
        return json(res, 422, {
          detail: [
            {
              loc: ["body", "default_phone_region"],
              msg: "Value error, Unknown country code",
            },
          ],
        });
      phoneRegion = b.default_phone_region;
    }
    for (const k of Object.keys(org)) if (k in b) org[k] = b[k];
  }
  if (path === "/organization")
    return json(res, 200, {
      ...ORG,
      is_active: true,
      plan: "pro",
      new_lead_gap_hours: 72,
      fuzzy_match_threshold: 85,
      assignment_strategy: "round_robin",
      default_phone_region: phoneRegion,
      ...org,
    });
  if (path === "/audit-logs")
    return list(
      res,
      [
        {
          id: uid(),
          occurred_at: now(),
          actor_type: "user",
          actor_id: ME.id,
          actor_label: ME.email,
          action: "auth.login",
          entity_type: null,
          entity_id: null,
          changes: null,
          request_id: null,
          ip_address: "127.0.0.1",
        },
      ],
      url,
    );
  if (path === "/email/mailboxes" && method === "GET")
    return json(res, 200, mailboxes);
  if (path === "/email/mailboxes/google/authorize" && method === "POST") {
    const address = `enquiries${mailboxes.length}@acme-exports.example.com`;
    mailboxes.push(mailboxView(address, { created_at: now(), last_synced_at: null }));
    return json(res, 200, {
      authorization_url: `${APP_URL}/settings/email?connected=${encodeURIComponent(address)}`,
    });
  }
  if ((m = /^\/email\/mailboxes\/([^/]+)$/.exec(path))) {
    const i = mailboxes.findIndex((x) => x.id === m[1]);
    if (i < 0) return json(res, 404, { detail: "Not found" });
    if (method === "DELETE") {
      const [gone] = mailboxes.splice(i, 1);
      if (gone.is_default_sender && mailboxes[0]) mailboxes[0].is_default_sender = true;
      return json(res, 204);
    }
    if (method === "PATCH") {
      const b = (await readBody(req)) ?? {};
      const bad = strict("MailboxUpdate", b);
      if (bad) return json(res, 422, bad);
      const box = mailboxes[i];
      if (b.is_default_sender) for (const x of mailboxes) x.is_default_sender = x === box;
      if (b.receive_enabled != null) box.receive_enabled = b.receive_enabled;
      if (b.skip_categories) box.skip_categories = [...new Set(b.skip_categories)].sort();
      box.updated_at = now();
      return json(res, 200, box);
    }
  }
  if (path === "/service-api-keys") return list(res, [], url);

  return json(res, 404, { detail: "Not found" });
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`mock leadflow api on http://127.0.0.1:${PORT}`),
);
