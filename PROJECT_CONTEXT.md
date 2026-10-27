# Project context: Lead management & CRM backend

This document is the full context for this project. Read this before doing any work — it contains every decision already made, so nothing here should be re-decided or re-designed from scratch.

## What this is

An internal lead management system, replacing manual tracking, built to eventually be offered to other companies as a product. It centralizes leads from multiple inbound channels into one system, automatically detects duplicates, tracks conversation state per lead, and drives follow-up/nurturing.

**Explicitly not using Frappe/ERPNext** or any off-the-shelf CRM. Decision was made after evaluation: Frappe's WhatsApp integration is an unmaintained third-party plugin with open bugs, its data model doesn't fit the Account→Contact→Lead→Touchpoint structure needed here, nearly all required features are custom work regardless of platform, and Frappe's AGPL license creates a source-disclosure obligation if this is ever resold as a hosted product to other companies. Building a lean custom stack instead avoids all of that with comparable total build effort.

## Inbound channels

- Website (API/webhook)
- Email
- Referrals
- Call / WhatsApp
- TPP (third-party partners, API/email)
- Exhibitions — business card photo + a voice note giving context, in any language. Requires OCR on the card and speech-to-text + structured extraction on the voice note, merged into one normalized lead payload. This is the most complex channel and is built last. **The photo and the recording are uploaded to the API itself** (taken with the phone camera / microphone in the web app, no file links); n8n polls for them, extracts, and a person confirms. See EXHIBITION_CAPTURE_GUIDE.md.

## Architecture

```
Channels → n8n (orchestration) → Core API (FastAPI) → PostgreSQL
                                        ↕
                                  Next.js (mobile web frontend)
                                        ↕
                                WhatsApp Cloud API (Meta, direct — already have access)
```

**n8n** owns orchestration: per-channel intake workflows, calling out to AI for extraction (voice/card), sending outbound messages, polling for due follow-ups. n8n is being built separately (in a different chat, possibly via an n8n MCP connector) — **this Claude Code project is backend/API/schema only. Do not build or reference n8n workflow files.**

**Core API (FastAPI, Python)** owns all business logic: dedupe matching, conversation-state transitions, lead assignment, scoring. This is the part of the system that must be correct and testable — real code, not visual workflow logic.

**PostgreSQL** is the single source of truth. n8n and the frontend both go through the API — nothing touches the database directly except the API.

**Frontend (Next.js)** — mobile-optimized, used by the sales team. Built separately (`exporter-leadflow-web`), it talks to this API only, server-side.

**Auth:** one integration key (`lfi_…`) for n8n → API calls, naming the organization in `X-Leadflow-Org` on every request; scoped, organization-bound API keys (`lfk_…`) for other machine callers. Short-lived JWT + refresh token (server-side revocable sessions) for frontend → API calls, with role-based permissions (exec / manager / admin). See "Multi-tenancy and security decisions" below.

**Hosting:** single VPS, Docker Compose (Caddy for TLS, Postgres, Redis, the API, a backup sidecar), ~$20–40/month; the API is stateless so it can scale out later. Runbook: docs/OPERATIONS.md. **Today** a free-tier demo runs on Render (API) + Neon (Postgres) + Upstash (Redis) + Vercel (web app): docs/OPERATIONS.md §12.

## Multi-tenancy and security decisions (made; do not re-decide)

This is built to be sold to several companies, so it is **multi-tenant from the schema up**:

- **Model:** shared database, shared schema. `Organization` is the root entity; **every** table in the data model below carries `organization_id`, and the Account/Contact/Lead/... descriptions that follow should be read as "per organization". Uniqueness (phone, email, SKU, slug of catalogue items…) is per organization. `User.email` is the one globally unique value (login needs no tenant field).
- **Isolation in three layers:** (1) the ORM scopes every query to the caller's org and fails closed with no org; (2) Postgres row-level security with `FORCE`, driven by a transaction-local setting, with the API connecting as a non-owner, non-superuser, non-BYPASSRLS role; (3) composite foreign keys `(organization_id, id)` so cross-tenant references are impossible. The app refuses to start in production if the DB role would bypass RLS.
- **Identity:** JWT (15 min) carries `org` and a session id; sessions and single-use rotating refresh tokens live in the database so revocation is immediate; lockout, argon2id, password policy. **API keys** are bound to one org, carry an explicit scope list (least privilege), can expire and be revoked, and can never be granted approve/delete/admin/config-write permissions.
- **Permissions**, not roles, are checked by endpoints (`leads:ingest`, `touchpoints:write`, `cadences:read`, `leads:sweep`, `quotations:approve`, `keys:manage`, `audit:read`, …). Roles are just bundles.
- **Audit:** append-only `audit_logs`, written automatically in the same transaction as each change; secrets redacted; immutable even to the DB owner.
- **Platform console, no tenant super-admin.** Platform admins (separate accounts at the company's email domain, mandatory two-step login) can create organizations and manage their platform settings at `/platform`, but never read customer data. Two roles (decided 27 Oct 2026, `0016`): **owners** can also suspend and delete organizations (delete = suspend, schedule, 7-day wait enforced by the database, confirm with a fresh authenticator code), reset company users' passwords, revoke integration keys and manage platform admins; **staff** do the rest. Exporting an organization is CLI only (`python -m app.cli`, owner DB credentials). The company's own organization is a tenant like any other, and the same email may be a platform admin and a user of an organization (two separate accounts and logins).
- **Per-org settings:** `new_lead_gap_hours`, `fuzzy_match_threshold`, `assignment_strategy` (round_robin | division), editable by the org admin.
- **Reliability:** Idempotency-Key on ingest/bulk-ingest/touchpoints (n8n retries are safe); Redis-backed rate limits; request IDs; JSON logs; Sentry hooks; `/health` and `/ready`; daily encrypted backups with a weekly automatic restore test; staging = same compose with a different env file.
- **n8n in a multi-tenant world (decided 22 Oct 2026, migration `0010`):** one integration key serves every organization that is switched on for automation; each call names its organization in `X-Leadflow-Org`. The key's permissions are capped, it is audited as `integration` and rate-limited per organization. n8n keeps no data of its own (no n8n data tables since 26 Oct).
- **Not built (yet):** billing/plans, MFA for company users (platform admins have it), SSO, email-driven flows (invites, password reset), per-org quotas, multi-org users. See PROJECT_STATUS.md §10.

## Data model

### Account
Represents a company.
| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| name | text | yes | |
| domain | text | no | derived from contact email if available |
| industry | text | no | |
| location | text | no | |
| created_at | timestamp | yes | |

### Contact
Represents a person at an Account.
| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| account_id | FK → Account | no | can exist before an account is confirmed |
| name | text | yes | |
| phone | text | no* | normalized on write — see dedupe rules |
| email | text | no* | normalized (lower-cased, trimmed) on write |
| designation | text | no | |
| whatsapp | text | no | the number to WhatsApp, E.164. A confirmed show capture fills it with the main number unless the card names another one |
| alternate_phone | text | no | a second number (a card with two numbers), E.164; informational, not an identity |
| created_at | timestamp | yes | |

\* A contact needs **a phone and/or an email** (database check constraint). Email-only contacts are normal: email enquiries often carry no number. Each is unique per organization when present.

### Lead
A specific inbound opportunity tied to a Contact.
| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| contact_id | FK → Contact | yes | |
| account_id | FK → Account | yes | |
| source | enum | yes | website, email, referral, whatsapp, call, tpp, exhibition, indiamart, alibaba, in_person (met face to face, not at a show) |
| division | text | no | for future territory-based assignment |
| status | enum | yes | see state machine below |
| owner_id | FK → User | no | null until assigned |
| quality_tag | text/enum | no | manual for now, see scoring notes |
| lead_title | text (≤200) | no | what this enquiry is about, e.g. "Piercing die for fan bracket" |
| requirement_summary | text (≤4000) | no | the requirement in a few lines |
| created_at | timestamp | yes | |
| updated_at | timestamp | yes | |

**Contact vs. lead (supersedes the old "same contact → same lead" rule):** the same phone or email means the same **Contact**; it does *not* mean the same **Lead**. A person can have several independent leads open at once (different products or requirements), each with its own status, owner, cadence position and touchpoints. Every Touchpoint belongs to exactly one Lead.

**Which lead does an ingested message go to?** The caller says so with `lead_resolution`:
- `new` — always open a new lead for the contact.
- `attach` (+ `lead_id`) — add to that lead (must exist, belong to that contact, and not be `won`/`lost`).
- `auto` (default; what older callers get) — continue the contact's **most recently active open lead** (not `won`/`lost`; activity = its last edit or last message) if that was within the organization's lead gap (`new_lead_gap_hours`, default 90 days); otherwise open a new lead.

An orchestrator (n8n) normally decides explicitly using `GET /leads/match`, which returns the contact's open leads with their recent messages.

### Touchpoint
Every individual interaction on a Lead.
| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| lead_id | FK → Lead | yes | |
| direction | enum | yes | inbound, outbound |
| channel | enum | yes | website, email, whatsapp, call, tpp, exhibition |
| content | text | no | |
| raw_source_ref | text | no | link to original file — voice note, card photo |
| created_at | timestamp | yes | |

### Collateral
| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| name | text | yes | |
| description | text | no | |
| file_url | text | yes | |
| type | enum | yes | pdf, video, link |
| tags | text[] | no | used for future AI-recommendation matching |

### Catalogue, FAQ
Same minimal shape as Collateral: `id`, `title`, `content`/`file_url`, `tags`. Keep simple for now.

### Capture (show capture) and Attachment
A **Capture** is a draft lead taken at an exhibition: optional card photos (front, and the back for two-sided cards), optional voice note, optional typed note, an Event, and what the extraction workflow suggested. Status: `draft -> submitted -> processing -> ready_for_review -> confirmed` (or `failed`, `discarded`). A person confirming it creates the Lead (source `exhibition`) through the normal ingest rules; extraction only ever suggests.

An **Attachment** is a stored file (`image` or `audio`) owned by one organization, kept in Postgres (so isolation, audit, backups and offboarding cover it): photos are re-encoded as clean JPEGs (no EXIF, upright, max 2560 px), voice notes are stored as recorded. After confirmation an attachment belongs to the lead's first Touchpoint. File contents never enter the audit log.

### Lead outreach (the first message)
A personalised first message to a new lead, one in progress per lead at most. Queued when a show capture is confirmed as a new lead (or from the lead page). **n8n's AI writes it** from what the API gives it (the voice note, typed note, card, products, promises); a **person** edits and approves it (or the organization turns on auto-send, never for leads with follow-ups paused); n8n sends it, or the person sends it from their own phone. The sent message becomes an outbound Touchpoint. Status: `requested → drafting → draft_ready → approved → sending → sent` (or `failed`, `cancelled`). The API stores the draft and the decision; it never writes or sends the text itself.

### Cadence
Configuration for follow-up timing, not hardcoded logic.
| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| lead_status | enum | yes | which status this cadence rule applies to |
| delay_hours | integer | yes | |
| message_template_id | text | yes | WhatsApp / primary template |
| email_message_template_id | text | no | template for contacts reachable by email |

`GET /cadences/due` also returns each lead's **contact** (phone/email) and **when the contact last wrote on WhatsApp and on email**, so the orchestrator can pick a channel that can actually reach them (e.g. WhatsApp's 24-hour window). It also embeds the lead's message templates (`/message-templates`, since `0012`) and leaves out paused and handed-off leads. The API never picks the channel; n8n decides and, for WhatsApp, asks the API to send (`POST /whatsapp/messages`).

### Event
| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| name | text | yes | |
| date | date | yes | |
| location | text | no | |

### User / Team
| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| name | text | yes | |
| role | enum | yes | exec, manager, admin |
| division | text | no | |

## Lead status state machine

| Status | Meaning | Can transition to | Triggered by |
|---|---|---|---|
| `new` | Just created, no outreach yet | `uncontacted` | System, immediately on creation |
| `uncontacted` | Exists, no outreach sent yet | `in_conversation` | First-touch message sent (n8n) |
| `in_conversation` | Active back-and-forth | `quotation_requested`, `stale` | New inbound reply logged, or no reply within cadence window |
| `quotation_requested` | Lead asked for pricing | `in_conversation`, `won`, `lost` | Rep sends quote and lead responds, or deal closes/doesn't |
| `stale` | No response for the configured window (default 7 days, adjustable via cadence config) | `in_conversation` | Inbound reply after nurture sequence |
| `won` | Deal closed | — (terminal) | Rep marks manually |
| `lost` | Confirmed dead | — (terminal) | Rep marks manually. Auto-transition after N failed nurture cycles is a possible future addition — not built now |

All transitions except `won`/`lost` are system-driven off an event, not manual action.

## Dedupe rules

**Hard match → same Contact:**
- Phone number, normalized to **international E.164** (`+6591234567`): an explicit country code is kept; a number written without one is read as a local number of the organization's default country (`default_phone_region`, deployment default `IN`); WhatsApp sender ids (country code without `+`) are read as international. Compare the E.164 values. (Replaced the original "last 10 digits" rule, which lost the country of foreign buyers.)
- OR exact email match (lowercased, trimmed).

**Fuzzy match → same Account (not same Contact):**
- Company name, normalized: lowercase, strip common suffixes (Pvt Ltd, LLP, Inc, Ltd, Co), strip extra whitespace.
- Exact normalized match → same Account, auto-linked.
- Close but not exact (similarity above ~85%, e.g. via trigram/Levenshtein) → flag as a possible match for manual review, do not auto-merge.

**Contact matching** looks phone and email up separately. Phone matches contact A and email matches a *different* contact B → use A, flag `contact_review_status: needs_review` (returning B's id), merge nothing. One identifier matches → use that contact and **fill** its empty phone/email; a *different* existing phone/email or a clearly different name is kept and only flagged. A placeholder name ("unknown", an email address, …) is replaced by a real one.

**Account per lead:** a new lead takes the company named in *its own* message (exact normalized match reuses the account, near match → new account flagged for review). Attaching to an existing lead keeps that lead's account; a different company in the message only flags `needs_review`.

**Resolution order:**
1. Hard match on phone or email → same Contact. Which Lead it goes to follows the `lead_resolution` rule above.
2. No Contact match, Account fuzzy-match is exact → new Contact under existing Account.
3. No Contact match, Account fuzzy-match is a "possible" (below auto-merge threshold) → create new Contact and new Account, flag for manual review/merge.
4. No match at all → new Contact, new Account.

## Lead assignment

Round robin, for now. Chosen over territory-based because there's no clean division/region mapping in place yet, and round robin needs no extra setup. **Capture the `division` field on every Lead regardless**, even though it's unused for assignment right now — this is so a future switch to territory-based assignment has historical data to work from immediately, instead of starting from zero.

This logic should live in an isolated, swappable module — not hardcoded inline — since the assignment method is expected to change later.

## Fit/quality scoring

Manual for now — a rep tags `quality_tag` on the Lead after contact. Deliberately not automated yet: there isn't enough historical data to define "good fit" confidently, and manual tagging now generates the labeled data needed to build automated or hybrid scoring later. Design the scoring module so a rule-based or AI-assisted suggestion can be added later without restructuring — the rep would still confirm/override in that future version.

## Human involvement points (for reference — not all API logic)

- Confirming AI-extracted data (voice note + card OCR) before it's written as a real record — there should be a review/confirm step, not automatic writes from noisy extraction
- Owning/working a lead once assigned
- Actually replying in an ongoing conversation (system surfaces history/context, rep replies)
- Making calls (system suggests questions/script, rep executes)
- Preparing and sending quotations
- Quality tagging (manual, per above)

## API surface (what the Core API must expose)

```
POST /leads/ingest            — normalized lead payload in; runs dedupe; returns status + is_new
GET  /leads/match             — dedupe lookup by phone/email/company; returns the contact's open leads
GET  /leads/{id}              — full lead record
GET  /leads/{id}/context      — full conversation history + current state (+ the contact)
GET  /leads/{id}/touchpoints  — paged message list
GET  /contacts/{id}/context   — a person across all their leads
POST /captures, /captures/{id}/card|card-back|voice|submit|confirm|discard — a person captures at a show
GET  /captures?status=submitted, POST /captures/{id}/claim|extraction|fail — the extraction workflow polls and reports
GET  /attachments/{id}/content — a stored photo / voice note
POST /leads/{id}/touchpoints  — log an interaction
PATCH /leads/{id}/status      — update conversation state
POST /leads/{id}/score        — set/record quality tag
POST /leads/{id}/assign       — set/reassign owner
GET  /cadences/due            — leads needing a follow-up action right now
POST /leads/{id}/first-touch  — ask for a personalised first message (a person approves it before it goes out)
GET  /outreach?status=requested|approved, POST /outreach/{id}/claim|draft|sent|fail — the writing and sending workflows
POST /whatsapp/messages       — send one WhatsApp message with the organization's stored token (Idempotency-Key required)
GET  /whatsapp/messages?wamid= — which lead a delivery-status update belongs to
GET  /integrations/orgs, /integrations/orgs/{slug}, /integrations/whatsapp/{phone_number_id} — integration key only
/message-templates            — follow-up message templates (CRUD)
POST/DELETE /leads/{id}/handoff — the WhatsApp bot hands a lead to a person / resumes
/ignored-senders              — senders judged "not a buyer" (record, list, lookup, un-ignore)
/platform/*                   — platform console (platform admins only)
```

Plus standard CRUD for Account, Contact, Collateral, Catalogue, FAQ, Event, User/Team, and auth endpoints (login/session for frontend, key validation for n8n).

**What does NOT belong in this API:** AI prompts and AI calls, and the decision of what to send on which channel. Those live in n8n, built separately. The API decides *when* something should happen and *whether* a lead is a duplicate. It does store what people edit in the web app: follow-up message templates (`0012`) and the AI-written first message a person approves (`0009`). And it sends WhatsApp messages when n8n asks (`0011`), so the Meta token never leaves the API (encrypted at rest). Email still goes out through n8n's Gmail.

## Build order

1. Postgres schema from the data model above, with migrations tooling from the start
2. FastAPI skeleton — basic CRUD on every table, no business logic yet, confirm schema works end-to-end
3. Auth (scoped org-bound API keys for service calls, JWT + refresh sessions for frontend, permission checks) — and multi-tenancy underneath everything (originally built single-tenant, retrofitted in the production-hardening pass)
4. Dedupe logic (`/leads/match`, used inside `/leads/ingest`)
5. State transition logic (`/leads/{id}/status` and the rules behind it)
6. Assignment logic (round robin, isolated/swappable module)
7. Scoring (manual tag storage, structured for future automation)
8. `/cadences/due` and remaining CRUD endpoints
9. Everything above should be testable independent of n8n or the frontend — n8n and the frontend are built separately and only interact with this API over HTTP

## Explicitly out of scope for this Claude Code project

- n8n workflows (built separately)
- Frontend/UI (Next.js, built separately in `exporter-leadflow-web`)
- Receiving WhatsApp messages (Meta's webhook goes to n8n). Sending is the one exception: since `0011` the API sends when n8n asks, so the token stays in the API.
- AI extraction (OCR, speech-to-text) — happens in n8n before data reaches this API; this API only receives already-normalized payloads
