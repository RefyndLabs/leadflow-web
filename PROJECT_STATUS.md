# Leadflow API — build status

An honest description of what exists in this repo right now, how it is secured, how it was verified, and what is *not* done. Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the spec and decisions, [docs/OPERATIONS.md](docs/OPERATIONS.md) for deploying and running it, and [N8N_INTEGRATION_GUIDE.md](N8N_INTEGRATION_GUIDE.md) for wiring workflows.

**One-line summary:** a multi-tenant FastAPI + PostgreSQL backend with tenant isolation enforced in three independent layers, short-lived JWTs with server-side revocable sessions, scoped org-bound API keys for n8n, an append-only audit log, and a containerised production stack with encrypted, restore-tested backups. Since 20 October 2026 it runs as a **free-tier demo deployment** (Render + Neon Postgres + Upstash Redis, web app on Vercel; see §1i); the production Docker stack in `deploy/` has still never run on a real server (see §9).

---

## 1. What changed in the multi-tenant / production pass

The earlier build was a single-company system. It is now a multi-tenant product:

- `Organization` is the root entity; every business table carries `organization_id`.
- Tenant isolation: ORM filter + Postgres row-level security + composite foreign keys (§3).
- New auth model: 15-minute access JWT + rotating refresh tokens + server-side sessions, lockout, password policy, argon2id (§4).
- Fine-grained permissions replace the three bare role checks; API keys are org-bound and scoped (§4).
- Automatic, atomic, append-only audit trail (§5).
- Idempotency-Key support, strict request schemas, per-org settings, deterministic pagination.
- Redis-backed rate limiting, request IDs, JSON logs, Sentry hooks, `/health` + `/ready`, security headers, body-size limits, startup safety checks (§6).
- Docker image, dev compose, production compose (Caddy TLS, private network, migrations job, backups), CI workflow, Dependabot, operator CLI (§7).
- Docs rewritten to match. The old single-tenant behaviours are gone.

Breaking changes for anything written against the earlier version: API keys must be re-issued with `scopes` (unscoped keys no longer exist); login returns `access_token` + `refresh_token`; the access JWT lasts 15 minutes; email is unique globally, not per company.

### 1b. Later change: contacts vs. leads, email-only contacts (migration `0003`)

- A contact needs a phone **and/or** an email (database check). `contact_phone` is optional on ingest and `phone` on `/contacts`; sending neither is a `422`.
- Same phone/email = same contact, **not** same lead. `POST /leads/ingest` takes `lead_resolution` (`auto` default / `new` / `attach` + `lead_id`) plus `lead_title` and `requirement_summary`, and reports `lead_resolution_applied`, `contact_review_status` and `other_matching_contact_id`.
- A new lead takes the company named in its own message (previously a repeat enquiry silently kept the contact's old company).
- `GET /leads/match` returns the contact and its open leads (last 3 messages each). New: `GET /contacts/{id}/context`, `GET /leads/{id}/touchpoints`; `GET /leads/{id}/context` now includes the contact.
- Cadences have an optional `email_message_template_id`; `GET /cadences/due` adds `contact` and `last_inbound_at {whatsapp, email}`.
- Lead activity = the later of the lead's last edit and its last message (before, only the lead row's edit time counted, so a busy conversation could look idle).
- (Phone numbers were later moved to international form: see 1e.) Contacts have no persistent review flag: `needs_review` is reported in the ingest response only. The reuse window is the existing per-organization `new_lead_gap_hours`, not a new setting.
- Also closed: any `change-me…` JWT secret (including the one in `.env.example`) is now refused by the production startup check.

### 1h. Later change: alternate number, WhatsApp default, personalised first message (migration `0009`, 21 Oct 2026)

- **Contacts have an `alternate_phone`** (E.164, informational, not an identity). On ingest and capture confirm: `contact_alternate_phone`. The show-capture extraction may send it; if it sends two numbers in `contact_phone` (`"a / b"`), the review draft makes the first the primary and the second the alternate (more than two: a warning).
- **WhatsApp defaults to the main number:** the capture review draft fills `contact_whatsapp` with the primary number unless the card names a different WhatsApp number, and a WhatsApp number equal to the phone is now stored (it used to be dropped). `ContactBrief`/`ContactRead` gained `alternate_phone` (additive).
- **First touch (`lead_outreach`, a new tenant table with RLS like every other):** confirming a show capture as a **new** lead queues a personalised first message (`request_first_touch`, default true); `POST /leads/{id}/first-touch` asks for one on any lead; the newest is in `GET /leads/{id}/context` as `outreach`.
  - `requested → drafting → draft_ready → approved → sending → sent`, plus `failed` / `cancelled`; one open per lead (partial unique index).
  - A workflow with the new key scope **`outreach:process`** claims it, reads `GET /outreach/{id}/context` (lead, contact, company, exhibition, products, notes, the capture's typed note / card text / transcript / conversation, research, sender, writing rules, draft schema, delivery details incl. the WhatsApp 24-hour window) and posts `/draft`.
  - A **person** (never a key) approves (`/approve`, with edits and a channel), sends it from their own phone (`/mark-sent`), rewrites (`/redraft` with guidance), retries or cancels. The sending workflow claims approved ones and reports `/sent` (or `/fail`); the message is logged as an outbound touchpoint (an uncontacted lead moves into conversation).
  - A sending claim is never handed out twice (it may have gone out); a stuck send is retried by a person after the lease.
  - Organization setting `first_touch_auto_send` (default off) approves drafts automatically, except for leads with follow-ups paused.
- Hand-off for n8n: `HANDOFF_N8N_FIRST_TOUCH.md` (built and live).

### 1i. Demo deployment and CI (20-22 Oct 2026)

- **Where it runs:** API on Render (free web service, `https://leadflow-api-l39t.onrender.com`), Postgres on Neon (free, Postgres 16, `ap-southeast-1`), Redis on Upstash (free; rate-limit counters only), web app on Vercel (`https://leadflow-web-mauve.vercel.app`). Procedure and gotchas: docs/OPERATIONS.md §12.
- **Data:** organization `refynd` (Refynd Labs) with the demo data (`seed-demo`) and real captures; all migrations up to `0009` applied.
- **Free-tier limits:** Render sleeps after ~15 minutes idle (the first request then takes up to a minute); Neon has ~0.5 GB storage, and photos and voice notes are stored in Postgres.
- **CI (GitHub Actions) runs on every push to `main` and is green:** tests on Postgres + ruff + `alembic check`, `pip-audit`, a full-history secret scan (gitleaks CLI; two reviewed test-password false positives in `.gitleaksignore`), and a container image build + Trivy scan. Dependabot is on.

### 1f. Later change: capture v2, lead details, notes, research (migration `0007`)

- **Exhibitions:** `end_date`, `country`, `booth`, `notes`; a team per show (`event_members`, `PUT /events/{id}/members`); `GET /events/current` (what is running today, with the show to pre-select for the caller); `?timing=upcoming|ongoing|past&mine=true`; `GET /events/{id}/summary` (exhibition performance per member).
- **Export enquiry details on every lead** (and on ingest / capture confirm): buyer type, requirement type, approximate volume, packaging, destination market, samples requested + details, expected timeline, target price, Incoterm, preferred contact channel; plus `next_follow_up_at` and `follow_ups_paused` (paused leads are left out of `/cadences/due`). Contacts gained `whatsapp`; accounts `country` (ISO) and `website`; products `category`, `hs_code`, `aliases` (other names, any language) and `is_active`.
- **Several products per lead** (`lead_products`, `PUT /leads/{id}/products`; `product_id` stays the main one). **Internal notes** (`lead_notes`: note / conversation summary / commitment with due date and done flag).
- **Richer show-capture extraction** (export details, products mentioned, a coherent English conversation write-up with promises and a glossary, verbatim transcript + translation). New fields are lenient: a wrong value is dropped, not a 422. `GET /captures/{id}/extraction-context` gives the workflow our profile, catalogue (with aliases), event, team and allowed values. `GET /captures/{id}` adds `suggestions` (confirm form pre-filled: products matched to the catalogue by `services/catalogue_match.py`, notes, follow-up date, owner = the rep, warnings) and `duplicates` (same phone/email/WhatsApp, similar names at the company, the same card captured twice, recommended attach/new). Confirm defaults the owner to the rep, queues research, and returns `redirect_lead_id`.
- **Lead lists:** shared filters on `GET /leads`, `GET /leads/overview` (rows with contact, company, country/region, event, owner, products, score, follow-up) and `GET /leads/facets`: stage/status, exhibition, AI score band or range, quality tag, created and follow-up ranges, overdue, country/region, owner, product, source, text search. `GET /leads/duplicates`, `GET /leads/regions`. `GET /leads/{id}/context` is now the full lead page.
- **Lead research** (`lead_research`): queued by capture confirm, by `POST /leads/{id}/research`, or for every new lead (`auto_research_new_leads`); a workflow with the new `research:process` scope polls `GET /research`, claims, reads `/context`, posts the result (score, sub-scores, reasons, confirmed facts vs. inferences, company profile, product fit, sources). The newest result is copied onto the lead (`qualification_score/tag/confidence`); `quality_tag` stays the person's call (the "rep confirms" rule of the scoring spec).
- **Organization profile** (`business_description`, `website`) for the AI workflows. `GET /products/match`, `GET /products?q=&category=&active=`, `GET /products/categories`; a product linked to a lead cannot be deleted (deactivate it).
- **Demo data:** `python -m app.cli seed-demo --slug <org>` (idempotent; fictional contacts on `.example` domains with follow-ups paused). Loaded into `demo` (Refynd Labs).
- Hand-offs: `HANDOFF_UI_CAPTURE_V2.md`, `HANDOFF_N8N_CAPTURE_V2.md`.

### 1e. Later fix: international phone numbers (migration `0006`)

- Phones were stored as "the last 10 digits" with India assumed, so a foreign buyer's country code was lost (+65 9123 4567 became 6591234567, and a WhatsApp follow-up could go to +91 6591234567). They are now stored in **E.164** (`+6591234567`) using the `phonenumbers` library.
- A number without a country code is read as a local number of the organization's country: new organization setting **`default_phone_region`** (`PATCH /organization`, two-letter code; deployment default `DEFAULT_PHONE_REGION=IN`). WhatsApp sender ids (digits with the country code but no `+`) are read as international on ingest.
- Two numbers in one field (a card) keep the first (since `0009` the capture review makes the second the contact's alternate number); something that is not a phone number is kept as bare digits rather than dropped. Matching compares E.164, so the same person matches however the number was written; two countries that share the last digits are now two people.
- Existing 10-digit numbers were given `+91` by the migration (correct for everything stored so far; a foreign number already cut to 10 digits by the old rule cannot be recovered). The downgrade converts back.
- `/leads/match?phone=` reads a number without `+` with the organization's country: callers that have a WhatsApp id must add the `+` (see the n8n brief).

### 1d. Later fix: captures no longer need an exhibition (migration `0005`)

- Confirming a capture with "Not from a show" was impossible (the API demanded an exhibition). The exhibition is now optional: with one the lead is `exhibition`, without one it is the new source/channel **`in_person`** (office or factory visit, walk-in, meeting). `event_id` omitted keeps the capture's own; `null` means "not from a show".
- `in_person` is a normal value everywhere (`LeadSource`, `TouchpointChannel`, filters, stats). The downgrade refuses while any row uses it.
- Verified end to end through the web app: capture with no show → confirm → lead with the photo and voice note attached.

### 1c. Later change: capture at a show with files stored in the API (migration `0004`)

- Photos and voice notes are **uploaded to the API** (multipart), not given as links. New tables `attachments` and `captures` (row-level security, composite FKs, runtime-role grants like every tenant table).
- Photos are decoded and **re-encoded as a clean JPEG** (EXIF/GPS stripped, rotation applied, max 2560 px, 50 MP / 16 MB limits, decompression-bomb safe). Voice notes are identified by their real header (webm/ogg/mp4/wav/mp3/flac/aac) and stored as recorded. The client's claimed type and filename are never trusted; files are served with the API-decided type and support `Range` (Safari audio).
- Capture workflow: a person creates/uploads/submits; **n8n polls** (the API never calls out), claims, downloads, posts the extraction (`captures:process` key, claim lease of 15 min); a person reviews and `confirm`s, which creates the lead with the files attached to its first message. A failed extraction never blocks a lead.
- New permissions `captures:read`, `captures:write` (people only), `captures:process` (grantable to a key). Touchpoints now list their `attachments`.
- Caddy allows ~18 MB bodies only on the two upload routes; the app's own limit likewise (everything else stays 8 MB). `purge-expired` also removes abandoned drafts (14 days) with their files; `export-org --files-dir` exports the files; offboarding deletes them. Pillow is a new dependency (audited).
- Limits: files are in Postgres (backups grow with them), no per-organization storage quota, no virus scanning of audio, no transcoding, HEIC refused, no thumbnails, no offline queue. Full detail in `EXHIBITION_CAPTURE_GUIDE.md`.

## 2. Architecture

```
n8n  ──────────┐
Next.js (later) ┴─HTTPS─▶ Caddy ─▶ FastAPI (stateless) ─▶ PostgreSQL (RLS)    Redis (rate limits)
```

```
app/api/routes/*.py    HTTP layer: schemas, status codes, one Permission per endpoint
app/services/*.py      Business logic: dedupe, state machine, assignment, ingest, cadence sweep, auth
app/models/*.py        SQLAlchemy models (= schema). mixins.py: TenantMixin, org-scoped FK/unique helpers
app/schemas/*.py       Pydantic request/response models (unknown fields are rejected)
app/core/*.py          config, db, tenancy, audit, auth, permissions, security, idempotency,
                       middleware, rate_limit, logging, sentry, error handlers, startup checks
app/cli.py             Operator commands (tenant lifecycle): runs as DB owner, never exposed over HTTP
alembic/versions/      0001 baseline schema · 0002 RLS, grants, lookup functions, audit trigger · 0003 optional phone, lead title/summary, email cadence template · 0004 attachments and captures · 0005 `in_person` source/channel · 0006 international phone numbers · 0007 capture v2: lead details, notes, products, research, exhibition staff · 0008 back-of-card photo · 0009 alternate number, first touch (`lead_outreach`)
deploy/                production compose, Caddyfile, backup/restore scripts
docker/postgres/init/  creates the restricted runtime role for dev
tests/                 517 tests against a real Postgres
```

## 3. Multi-tenancy: how isolation works

Shared database, shared schema. Three layers, each tested to hold on its own:

1. **Application layer.** Every request opens its DB session bound to the caller's `organization_id` (from the verified JWT or API key). A SQLAlchemy `do_orm_execute` hook adds `WHERE organization_id = :org` to every ORM query on tenant tables and **fails closed** (matches nothing) if no tenant is set. A `before_flush` hook stamps new rows with the tenant and rejects any write that targets another tenant.
2. **Database layer (Postgres RLS).** Every tenant table has `ENABLE` + `FORCE ROW LEVEL SECURITY` with a policy on `app_current_org()`, a transaction-local setting written at each transaction begin. Even raw SQL from the API's role only sees its own tenant's rows; with no tenant set it sees nothing. The API's DB role is not a superuser, has no `BYPASSRLS` and owns nothing, and the app **refuses to start in production** if that is not true.
3. **Referential layer.** Child tables reference parents with composite keys `(organization_id, parent_id)`, so a row can never point at another tenant's row even if layers 1 and 2 were bypassed.

Pre-authentication lookups (user by email, API key by hash, refresh token by hash) use three narrow `SECURITY DEFINER` functions that return only `(id, organization_id)`.

There is deliberately **no cross-tenant HTTP endpoint** and no super-admin role. Tenants are created and suspended by an operator through the CLI (docs/OPERATIONS.md §3, §9).

`tests/test_multitenancy_isolation.py` (90 tests) attempts cross-tenant reads, writes, references, deletes, list/filter leaks and stats leaks across the endpoints; `tests/test_tenancy_guards.py` checks RLS coverage on every `organization_id` table, FK guards, role privileges and migration up/down/up.

## 4. Authentication and authorization

- **Users** log in with email + password (`POST /auth/login`) and get a 15-minute HS256 access token (pinned algorithm; required claims `iss, aud, sub, org, sid, jti, typ, iat, nbf, exp`) plus a refresh token.
- **Sessions are server-side.** Every access token names a session (`sid`); logout, logout-all, password change/reset, user deactivation, org suspension and admin `revoke-sessions` take effect on the very next request.
- **Refresh tokens** are single-use and rotate; presenting an already-used one is treated as theft and revokes the whole session (audited).
- **Lockout:** 5 failed logins in 15 min locks the account (configurable). Login does constant work whether or not the user exists and returns a generic error.
- **Passwords:** argon2id; minimum 12 characters; rejected if common (including leetspeak / digit-suffix variants) or if they contain the email or name.
- **Roles** `exec` < `manager` < `admin` map to `Permission` sets (`app/core/permissions.py`). Each endpoint declares exactly one permission.
- **API keys** (`lfk_…`): SHA-256 hashed at rest, shown once, bound to one organization, carry an explicit `scopes` list, optional expiry, revocable, `last_used_at` tracked. They can never hold approve / delete / user-management / key-management / config-write permissions.
- Secret rotation without logging everyone out: `JWT_SECRET_PREVIOUS`.

## 5. Audit trail

Every insert/update/delete on business, user, key and session data is recorded automatically in the same transaction as the change (a change and its audit row commit or roll back together), with actor (user or key), request ID, IP, user agent and a diff with secret fields redacted. Login successes/failures/rejections and refresh-token reuse are audited explicitly. `audit_logs` is append-only: the API role has INSERT/SELECT only, and a trigger rejects UPDATE/DELETE even for the owner (offboarding a tenant is the one sanctioned exception). Read via `GET /audit-logs` (admin, tenant-scoped, filterable).

## 6. HTTP-layer hardening

Pure-ASGI middleware: request IDs, security headers (HSTS in production, CSP, `nosniff`, `frame-ancestors`, `no-store`), streaming request-body cap (8 MB, also enforced when `Content-Length` is absent), `TrustedHost`. CORS is closed unless origins are listed; credentials are off. Swagger/ReDoc are disabled in production. Rate limits are Redis-backed, keyed by API key or IP, strict on login, with an in-memory fallback if Redis blips. Errors are generic: no stack traces, SQL or internals leak (`IntegrityError` → 409). The `Idempotency-Key` header is supported on `/leads/ingest`, `/leads/bulk-ingest` and touchpoint creation, so an n8n retry never double-logs. Startup checks refuse to boot production with a default/short JWT secret, no Redis, wildcard hosts/CORS, or a privileged DB role. Database sessions have statement, lock and idle-in-transaction timeouts.

## 7. Infrastructure that ships in the repo

| Piece | Where | Status |
|---|---|---|
| Container image (multi-stage, non-root uid 10001, proxy headers) | `Dockerfile` | built and run |
| Dev stack (Postgres + Redis on 127.0.0.1, restricted role created) | `docker-compose.yml`, `docker/postgres/init/` | used throughout development |
| Production stack (Caddy TLS, private network, migrate job, read-only API container, `cap_drop: ALL`) | `deploy/docker-compose.yml`, `deploy/Caddyfile` | brought up locally, including TLS via Caddy's internal CA |
| Backups: dump → verify → AES-256 → optional S3 → retention; weekly automatic restore test | `deploy/backup/` | backup and restore-test run and verified locally, including failure paths |
| CI: ruff, alembic check, tests on Postgres, pip-audit, gitleaks secret scan, image build + Trivy; Dependabot | `.github/` | runs on every push to `main`, green |
| Operator CLI: create/suspend/activate/export/offboard org, purge-expired | `app/cli.py` | tested |
| Staging | same compose, another env file and project name | documented; nothing provisioned |

## 8. Endpoint reference

Every endpoint needs `Authorization: Bearer <access token>` or `X-API-Key: <key>` except `/health`, `/ready`, `/auth/login`, `/auth/refresh`. "Key" = the permission can be granted to an API key. Lists take `?limit` (max 200) and `?skip` and return `X-Total-Count`.

| Area | Endpoints (permission) |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/logout-all` · `POST /auth/change-password` · `GET /auth/me` |
| Organization | `GET /organization` (org:read) · `PATCH /organization` (org:write; name, new_lead_gap_hours, fuzzy_match_threshold, assignment_strategy, default_phone_region, business_description, website, auto_research_new_leads, first_touch_auto_send) |
| Users | `POST/GET /users`, `GET/PATCH /users/{id}`, `POST /users/{id}/reset-password`, `POST /users/{id}/revoke-sessions` (users:read/write) |
| API keys | `POST/GET /service-api-keys`, `DELETE /service-api-keys/{id}` (keys:manage, humans only) |
| Audit | `GET /audit-logs` (audit:read) |
| Leads | `POST /leads/ingest` (leads:ingest, key; `lead_resolution` auto/new/attach) · `POST /leads/bulk-ingest` (≤500, key) · `GET /leads/match` · `GET /leads/stats` · `POST /leads/sweep-stale` (leads:sweep, key) · `GET/POST /leads` · `GET/PATCH /leads/{id}` · `GET /leads/{id}/context` · `PATCH /leads/{id}/status` · `POST /leads/{id}/score` · `POST /leads/{id}/assign` |
| Touchpoints | `POST /leads/{id}/touchpoints` (touchpoints:write, key) · `GET /leads/{id}/touchpoints` (leads:read) |
| Show capture | `POST/GET /captures`, `GET/PATCH /captures/{id}`, `POST /captures/{id}/card`, `/card-back` and `/voice` (multipart; card = front, card-back = optional back, since `0008`), `DELETE …/card` / `…/card-back` / `…/voice`, `POST …/submit`, `…/discard`, `…/confirm` (captures:write, people only) · `POST …/claim`, `…/extraction`, `…/fail` (captures:process, key) · `GET /attachments/{id}` and `/content` (captures:read/:process or leads:read) |
| Quotations | `POST/GET /leads/{id}/quotations` · `PATCH …/{qid}` · `POST …/{qid}/approve` and `…/reject` (humans with quotations:approve only) |
| Samples | `POST/GET /leads/{id}/sample-requests` · `PATCH …/{sid}` |
| Accounts / Contacts | full CRUD (`accounts:*`, `contacts:*`; delete is human-only) · `GET /contacts/{id}/context` (leads:read + contacts:read) |
| Products | CRUD, `POST /products/bulk`, variants, `GET /products/match`, `GET /products/categories` (`catalog:*`) |
| Catalogue / FAQs / Collaterals | CRUD (`catalog:*`) |
| Events | CRUD (`events:*`) · `GET /events/current` · `PUT /events/{id}/members` (events:write) · `GET /events/{id}/summary` (stats:read) |
| Lead lists & page | `GET /leads/overview`, `/leads/facets`, `/leads/duplicates`, `/leads/regions` (leads:read) · `GET/POST /leads/{id}/notes`, `PATCH/DELETE …/{nid}` · `GET/PUT /leads/{id}/products` |
| Research | `POST /leads/{id}/research` (leads:write) · `GET /leads/{id}/research` (leads:read) · `GET /research`, `GET /research/{id}`, `POST …/claim`, `GET …/context`, `POST …/result`, `POST …/fail` (research:process, key) |
| First message | `POST /leads/{id}/first-touch` (leads:write) · `GET /leads/{id}/outreach` (leads:read) · `GET /outreach/{id}` (leads:read or outreach:process) · `PATCH /outreach/{id}`, `POST …/approve`, `…/mark-sent` (people only), `…/redraft`, `…/retry`, `…/cancel` (leads:write) · `GET /outreach`, `POST …/claim`, `GET …/context`, `POST …/draft`, `…/sent`, `…/fail` (outreach:process, key) |
| Cadences | CRUD · `GET /cadences/due` (cadences:read, key) |
| Health | `GET /health` (liveness) · `GET /ready` (DB + Redis) |

Business rules (dedupe, lead-vs-reply, state machine, assignment) are as in PROJECT_CONTEXT.md. Duplicate detection is also enforced by DB unique constraints on `(organization_id, phone)` and `(organization_id, email)`, so concurrent ingests cannot create duplicates.

---

## 8b. Feature checklist mapping (client SOP)

Every feature in the client's "Feature Checklist" tab, **excluding the five explicitly deprioritized (red) ones** you said to ignore (Call scheduling, AI-generated call talking points, Call logs and meeting notes, Salesperson performance tracking, Salesperson-wise performance report — none of these are built, matching your instruction).

**Legend**: ✅ built (API-side) · 🔶 partially API's job, rest is n8n/frontend · ⛔ correctly out of scope for this API (n8n/frontend's job, confirmed against PROJECT_CONTEXT.md's boundary) · ❓ needs client input before anything can be built

| Feature | Status | Notes |
|---|---|---|
| Capture enquiries from email/WhatsApp/website forms | 🔶 | `POST /leads/ingest` accepts any of these via `source`. n8n does the actual channel integration (reading the inbox/webhook) and calls this endpoint. |
| Capture leads from IndiaMART / Alibaba | 🔶 | `LeadSource`/`TouchpointChannel` now have explicit `indiamart`/`alibaba` values (previously would've been lumped under generic `tpp`), so they're distinguishable in `/leads/stats`. n8n owns the actual marketplace API integration. |
| Add leads manually / bulk import | ✅ | `POST /leads` (single, manual) and `POST /leads/bulk-ingest` (batch, up to 500/call). |
| Scan business cards | ⛔ | OCR is n8n/AI's job per PROJECT_CONTEXT.md. This API receives the already-extracted structured data via `/leads/ingest`. |
| Create and manage exhibitions | ✅ | `Event` CRUD (admin/manager for writes). |
| Tag leads to an exhibition | ✅ | `Lead.event_id`, settable on ingest or via `PATCH /leads/{id}`. |
| Extract requirements/next steps from voice notes | ⛔ | AI extraction is n8n's job. The extracted text is stored via `touchpoint.content`, same as any other channel. |
| Product catalogue | ✅ | New `Product` model — name, SKU, description, MOQ, packaging, certifications, tags. |
| Bulk product upload through Excel | 🔶 | `POST /products/bulk` takes parsed rows as JSON. Actual `.xlsx` parsing is a frontend/n8n job — this API doesn't own file-format concerns (matches the spec's philosophy for Catalogue/Collateral already). |
| Product variants or SKUs | ✅ | `ProductVariant`, with a JSONB `attributes` field for arbitrary variant dimensions (size/color/etc). |
| Custom product or specification enquiry form | 🔶 | `Lead.product_id` + the initial touchpoint's free-text `content` cover this. The form itself is frontend. |
| MOQ, packaging and certification details | ✅ | Fields on `Product`. |
| Catalogue and brochure library | ✅ | Already existed (`Collateral`/`CatalogueItem`), now gated to admin/manager for writes. |
| Certification and document library | ✅ | Same as above — `Product.certifications` plus the existing `Collateral` type. |
| AI recommendation of relevant collateral | ⛔ | The AI matching itself is out of scope (per spec). `Collateral.tags` (already existed) is the hook an n8n/AI workflow would query against. |
| Automatically read incoming enquiries / extract requirements / pre-set qualifying questions / research buyer or contact / suggest clarification questions / recommend next action / draft first response / auto-acknowledge / human approval before sending / edit AI drafts | 🔶 | Since `0007`/`0009` the API holds the parts that need state: lead research (`lead_research`) and the first message to a new lead (`lead_outreach`: AI draft, edit, human approval, send, logged). The AI itself runs in n8n. Earlier note: | All of "AI qualification and responses" is n8n+LLM work by design (PROJECT_CONTEXT.md: "message content/templates... AI extraction prompts... live in n8n"). Where the API needed a hook, one exists: `touchpoint.content` for any AI-drafted text, `touchpoint.approved_by_user_id`/`approved_at` for the one that needed a place to record human approval. |
| Classify leads as Hot, Warm or Cold | ✅ | `Lead.quality_tag`, now a proper enum instead of free text. `POST /leads/{id}/score` sets it — n8n/AI or a rep can call it. |
| Custom sales pipeline | ✅ | The `LeadStatus` state machine, fully implemented (§5). |
| Automatic lead assignment | ✅ | Round-robin (`POST /leads/{id}/assign`). |
| Product-wise or territory-wise assignment | 🔶 | Territory/division-based assignment exists as an alternate strategy (`ASSIGNMENT_STRATEGY=division`), off by default — PROJECT_CONTEXT.md explicitly says there's no clean division mapping yet, so round robin stays the default, but switching is now a config flag, not new engineering. Product-wise assignment (routing by which product someone asked about) was **not built** — nothing in the spec or checklist defines who "owns" a product, so there's no mapping to route by. Needs a decision before it can be built. |
| Follow-up reminders / preset follow-up schedules | ✅ | `Cadence` + `GET /cadences/due` (now returns the matching template, not just the lead). |
| Automated email/WhatsApp follow-ups | ⛔ | Sending is n8n/WhatsApp Cloud API's job, per spec. This API tells n8n *who's due*, never sends anything itself. |
| Pause or modify scheduled follow-ups | ✅ | `PATCH`/`DELETE /cadences/{id}` — pausing a channel's cadence, not a single lead's, matches the granularity the `Cadence` model has (per-status, not per-lead). |
| Sample request tracking | ✅ | New `SampleRequest` model + endpoints. |
| Quotation tracking | ✅ | New `Quotation` model + endpoints. |
| Lost-lead reason tracking | ✅ | `Lead.lost_reason`, required by the API when status → `lost`. |
| Add multiple team members | ✅ | `POST /users` (admin-only, see §6.2). |
| Different access for different roles | ✅ | See §6.2 — meaningfully tiered now (exec/manager/admin), not just three role labels with no enforcement. |
| Manager approval for messages | 🔶 | For the first message to a new lead the gate is in the API since `0009`: an AI draft waits in `lead_outreach` until a person approves it (`POST /outreach/{id}/approve`, people only), unless the organization turned on auto-send. Any user with `leads:write` can approve (not managers only). Other messages: `Touchpoint.approved_by_user_id`/`approved_at` exist for n8n to record approvals. |
| Manager approval for quotations or pricing | ✅ | `Quotation.approval_status` + `POST .../approve` / `.../reject`, admin/manager-only. |
| Central company email / WhatsApp integration | ⛔ | Entirely n8n/Meta/Gmail-API's job, correctly out of scope per PROJECT_CONTEXT.md's explicit boundary. |
| Sales overview dashboard / leads by source / hot-warm-cold summary / pending follow-ups / leads with no recent activity / quotations and orders summary / exhibition performance / product-wise enquiry report | ✅ | `GET /leads/stats` (aggregate counts) + filters on `GET /leads` (`?status=`, `?source=`, `?event_id=`, `?product_id=`, etc.) + `GET /cadences/due` (pending follow-ups) give the frontend everything it needs without bespoke endpoints per chart. The dashboard UI itself is frontend work. |
| Integration with existing CRM | ❓ | No target system named in the SOP (Required?/Notes columns are blank). Can't be built without knowing what "existing CRM" means here. |
| Integration with ERP | ❓ | Same — no target system specified. |
| Historical lead-data migration | ✅ | `POST /leads/bulk-ingest` is a generic mechanism for this — up to 500 rows/call, run it in batches for a larger migration. |
| Custom dashboard or report | ❓ | Undefined in the SOP. `/leads/stats` plus `GET /leads` filters cover the standard reports; anything beyond that needs a spec. |
| Other feature required | ❓ | Blank in the SOP — nothing to build against. |

---

## 9. Verification: what was actually done, and what was not

**Done (developer Windows machine, Docker Desktop):**
- 517 automated tests pass (22 Oct 2026) against a real Postgres whose schema is built by the real Alembic migrations, with the API running as the restricted role. `ruff` clean, `alembic check` clean (models and migrations agree), `pip-audit` found no known vulnerabilities in dependencies.
- Isolation attacks (API and raw SQL), session/refresh/lockout semantics, key scoping, audit atomicity and immutability, idempotency, HTTP hardening, startup checks.
- The production compose stack was brought up end to end (migrate → api → Caddy TLS); Redis-backed rate limiting confirmed live; concurrency races (parallel ingest of the same person, parallel refresh) confirmed to resolve correctly; encrypted backup + restore-test ran, and their failure paths fail loudly.
- Load smoke test (2 workers, Redis, ~900 leads): reads 30-50 ms; single ingest ~34 req/s at 10 concurrent (p50 ≈ 230 ms; rare multi-second p99 outliers not root-caused); 500-row bulk ingest ≈ 12 s. An earlier, much worse reading came from the load script creating a new HTTP client per request, not from the server. One laptop is not a capacity plan.

**Since then:** CI runs green on GitHub on every push; the API runs as a demo on Render/Neon/Upstash (startup checks, row-level security and the restricted role verified there; migrations applied by hand as the owner, see OPERATIONS.md §12).

**Not verified. Do these before relying on them:**
- Sentry has never received an event (no real DSN was available).
- S3/B2/R2 upload has not run against a real bucket.
- Real Let's Encrypt issuance (only Caddy's local CA was exercised); needs real DNS.
- Multi-instance behaviour of the rate limiter with real replicas.
- No third-party penetration test or code audit: the security work is thorough but self-reviewed.
- Nothing has been load-tested on production-class hardware or with realistic data volumes.
- The production Docker stack (`deploy/`: Caddy, backups, restore test) has not run on a real server. The demo uses managed free tiers instead and has **no backups beyond Neon's own** (its free-tier restore window).

## 10. Known limitations and things not built

**Security / identity**
- No MFA, SSO/SAML/OIDC, or email-based flows (self-service password reset, email verification, invitations). Admins create users and reset passwords; the API sends no email.
- A user belongs to exactly one organization, and an email address is unique across the whole deployment (needed to resolve a login without asking for a tenant). The same person cannot have accounts in two tenants with one address, and an admin creating a user with an address that exists in another tenant gets a conflict, which reveals that the address is registered somewhere.
- Row-level security relies on a transaction-local setting that the API itself writes. Any code path that ran attacker-influenced SQL as the app role could set a different tenant. The codebase uses parameterised queries only, and the other layers (least-privilege grants, no owner rights, composite FKs) still apply, but there is no further defence against a future SQL-injection bug.
- Data at rest is not application-encrypted; use disk/volume encryption. Backups are encrypted. TLS to Postgres is not configured (same-host private network).
- No per-org rate limits or quotas (limits are per IP / per key).

**Product / operations**
- Billing, plans and usage limits are not built (`plan` is a stored label only).
- No audit-log retention, archival or partitioning; the table grows without bound.
- Backups are daily logical dumps: RPO up to ~24 h, no point-in-time recovery, restore is whole-database. A single-VPS deployment means host failure is downtime until restore.
- `purge-expired` must be scheduled by you (host cron).
- Alerts are documented (docs/OPERATIONS.md §8) but not created; there is no dashboard.
- Bulk import is synchronous (≤500 rows/call); larger migrations must be batched by the caller.

**Scope decisions (unchanged)**
- No n8n workflows, no frontend, no message sending, no OCR/STT/LLM. Those belong to n8n and the frontend. How n8n is arranged when several tenants share one instance is undecided; today each tenant would use its own org-bound API key(s).
- Product-wise lead assignment, CRM/ERP integrations and custom reports are undefined in the SOP and not built.
- The five red-flagged SOP features are intentionally not built.

## 11. Running it

See [docs/OPERATIONS.md](docs/OPERATIONS.md) §11 for local development, §2 for the production Docker stack and §12 for the current demo deployment. The code is on GitHub (`RefyndLabs/leadflow-api`, branch `main`).
