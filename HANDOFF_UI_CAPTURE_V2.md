# Web app hand-off: capture v2, lead lists, lead page, research

**Status (22 Oct 2026): done.** Everything below is built in the web app and deployed (Vercel), along with migration `0009`'s alternate number, WhatsApp default, first-message card and Save contact (see the web app's `README.md`). Kept as the reference for the contract.

**For:** the agent working on the web app (`exporter-leadflow-web`).
**API date:** 9 October 2026, migration `0007`. **Updated 17 October 2026, migration `0008`: two-sided business cards (front + optional back photo). Read §00 first.**
**Read with:** `STATUS_UI.md` (how the app talks to the API) and `openapi.json`.

**Nothing existing breaks.** Every change is additive, apart from the small points in §9.

**Start by refreshing the API types:**
- Re-export `openapi.json` from the running API: `http://127.0.0.1:8000/openapi.json`.
- Then run `pnpm gen:api && pnpm test`.

---

## 00. NEW (17 Oct 2026): photo of the back of the card

Many business cards are printed on both sides (a second language, an address, a product list). A capture can now hold **two card photos: the front and, optionally, the back.** One photo still works exactly as before.

### 00.1 API changes (all additive)

| What | Detail |
|---|---|
| `POST /captures/{id}/card-back` | **New.** Same as `POST /captures/{id}/card`: `multipart/form-data`, one part named `file`, same formats (JPEG/PNG/WebP/GIF/BMP; HEIC refused), same 16 MB limit, same rate limit, same clean-JPEG re-encoding. Replaces any earlier back photo. Returns `CaptureRead`. Needs `captures:write`. |
| `DELETE /captures/{id}/card-back` | **New.** Removes the back photo. `204`. |
| `CaptureRead.card_back` | **New field**, `AttachmentRead` or `null`, next to `card` (which is now "the front"). Present on every capture read: list, detail, claim, confirm response, and `captures[]` in `GET /leads/{id}/context`. |
| `POST /captures/{id}/card`, `DELETE …/card` | **Unchanged.** "card" means the front. |
| `extracted.card_back_text` | **New, optional.** The text n8n read off the back. `extracted.card_text` stays the front. |
| Submit | Allowed with any one of: front, back, voice note (still `422` with none of them). |
| Rules shared by both sides | Uploading or removing either side is only allowed in `draft`, `ready_for_review` or `failed` (`409` otherwise), and it **sends the capture back to `draft`**: the earlier extraction is cleared and the capture must be submitted again. Same as the front today. |
| Discard | Deletes front, back and voice note. |
| Confirm | Attaches **all** files (front, back, voice) to the lead's first message. A touchpoint can now carry **two images** and one audio. |
| Duplicates | `other_captures[].reason = "Same card photo"` now fires when **either side** matches either side of another open capture. |

The rest of this file was written before two-sided cards; wherever it says "the card photo", read "the card photo(s)".

### 00.2 What to change in the web app

1. **Types:** re-export `openapi.json`, then `pnpm gen:api` (`card_back`, `card_back_text`, the two new routes).
2. **Server routes (BFF):**
   - The streaming upload route (`/api/captures/[id]/card|voice`) must also accept **`card-back`** and forward it, unbuffered, to `POST {API_URL}/captures/{id}/card-back`. Either add a third route folder `app/api/captures/[id]/card-back/route.ts`, or make one route take the kind as a segment validated against `card | card-back | voice`.
   - Add `DELETE /captures/{id}/card-back` to the `/api/lf/[...path]` gateway allow-list.
   - The API and the production proxy (Caddy) already allow the large upload body on `/card-back`. If the web app's own server caps body sizes per path, allow it there too.
3. **Booth screen (`/events/capture`):**
   - Two photo slots: **"Front of card"** and **"Back of card (optional)"**. Each has the same Take photo / Choose a file buttons and in-page camera dialog as today, its own thumbnail, Retake and Remove.
   - Suggested: once the front is taken, show a small "Add the back" button rather than a second big slot, so one-sided cards stay one tap.
   - **Done:** `POST /captures`, then `/card`, `/card-back`, `/voice` (whichever exist, any order), then `/submit`. Per-file progress and retry, as today.
   - A back-only capture is allowed by the API; no need to block it.
4. **Captures queue:** the thumbnail stays the front (`card`); fall back to `card_back` when there is no front. Optionally a small "2 sides" badge when both exist.
5. **Review screen (`/captures/[id]`):**
   - Show both photos, labelled: side by side on desktop, a Front / Back toggle (or swipe) on phones. Both zoomable.
   - Let the reviewer add, replace or remove the back here too (allowed in `ready_for_review` / `failed`). **Warn first:** changing a photo sends the capture back to draft and clears the current suggestions. After such a change, re-fetch `GET /captures/{id}` and offer "Read again" (`POST /submit`).
   - Transcript panel (§4.3 G): show `extracted.card_back_text` under `card_text`, labelled "Back of card".
6. **Lead page:**
   - "From the show" (§6.2 item 8): show `captures[0].card` and `captures[0].card_back` (labelled Front / Back), plus `card_back_text`.
   - Conversation thread: **do not assume a touchpoint has at most one image.** Render every `kind: "image"` attachment. To label front/back, compare attachment ids with `captures[0].card.id` / `captures[0].card_back.id`; attachments themselves do not say which side they are.
7. **Mock API (`pnpm mock-api`):** add `card_back` (null by default) to capture objects, the two routes, and `card_back_text`.
8. **Tests:** the upload route for `card-back`; Playwright: front + back uploaded → both thumbnails → submit; review shows both; a back-only capture submits; removing the back works.

A web app that ignores `card_back` keeps working; it just never shows or uploads a back.

---

## 0. What the product now does

### Capture at a show (Flow 1)

1. **Pick the show.** It is pre-selected automatically when the rep is at one, and its name and stand are shown at the top of the screen.
2. **Card and voice note.** Take a photo of the front of the card (or upload a file), **optionally the back too (new, §00)**, and record a voice note.
3. **n8n extraction.** n8n now extracts more:
   - contact details, WhatsApp, website and country;
   - export details;
   - the products mentioned, matched to our catalogue;
   - a coherent English write-up of the conversation: who they are, what they need, what we promised. Local or dialect terms are translated.
4. **Review.** The review screen arrives **already filled in**:
   - products pre-selected;
   - follow-up date taken from the promises we made;
   - the lead assigned to the rep who captured it;
   - conversation notes written;
   - a duplicate check done (it recommends adding to an existing enquiry or starting a new one).
5. **Confirm.** The rep edits anything and confirms. The app then **opens the new lead's page**, and lead research is queued automatically.

### Lead research and qualification (Flow 2)

- **One list of all leads**, with the filters from the brief: status, exhibition, qualification score, date created (presets and custom range), next follow-up, country and region. Search and counts per filter are included.
- **A lead page** with:
  - every extracted detail (name, email, website, phone, MOQ and the other export details);
  - products;
  - notes and commitments;
  - the conversation, with the card photo(s) and voice note;
  - the **qualification panel** from the screenshot (score, sub-scores, reasons, confirmed facts vs. possible inferences).

### Demo data

Demo data is loaded in the **Refynd Labs** organization (`demo`). See §10.

---

## 1. New enums (add to `enums.ts` with labels)

| Enum | Values |
|---|---|
| `BuyerType` | `importer, distributor, wholesaler, retailer, brand_owner, manufacturer, trading_agent, horeca, ecommerce, end_user, other` |
| `RequirementType` | `regular_supply, trial_order, one_time_order, private_label, samples_only, price_enquiry, distributorship, other` |
| `ContactChannel` (preferred contact channel) | `whatsapp, email, call` |
| `LeadNoteKind` | `note, conversation_summary, commitment` |
| `LeadProductSource` | `manual, extraction` ("heard in voice note"), `research` ("suggested by research") |
| `ResearchStatus` | `requested, processing, completed, failed` |

**Suggested labels:**
- `brand_owner` → "Brand owner / private label".
- `horeca` → "Hotels, restaurants, cafés".
- `commitment` → "Promise".

---

## 2. Exhibitions

### Event fields

`GET/POST/PATCH /events` now return **`EventDetail`**:
```
{ id, name, date, end_date, location, country, booth, notes,
  timing: "upcoming" | "ongoing" | "past",
  members: [ { user_id, name, email, role, is_active, added_at } ] }
```
- `date` is the first day of the show and `end_date` the last day (null for a one-day event).
- `country` is a two-letter code. The API upper-cases it.
- `booth` is our stand number, shown at the top of the capture screen.
- `end_date` before `date` returns `422`.

### Endpoints

| Call | Use |
|---|---|
| `GET /events?timing=upcoming\|ongoing\|past&mine=true&on=YYYY-MM-DD` | Exhibitions list. Tabs: Ongoing / Upcoming / Past, plus a "My shows" toggle. **Send `on` = the user's local date.** |
| `GET /events/current?on=YYYY-MM-DD` | `{ on, events: EventDetail[], suggested_event_id }`. The caller's own shows come first. `suggested_event_id` is set when exactly one ongoing show includes the caller, or exactly one show is running at all. Otherwise it is null and the person picks. |
| `PUT /events/{id}/members` `{ members: [{ user_id, role? }] }` | Sets who works the show. **Replaces the whole list.** Needs `events:write` (managers and admins). On create you can also pass `member_user_ids: [...]`. |
| `GET /events/{id}/summary` | Exhibition performance: `total_leads`, `leads_by_status`, `leads_by_quality`, `captures_by_status`, `captures_to_review`, `by_member: [{ user_id, name, captures, leads }]`. Needs `stats:read`. |
| `DELETE /events/{id}` | Now also `409` when captures are tagged to the show. |

### UI to build

1. **Event form:** add *End date*, *Country* (select), *Our stand*, *Notes*, and a *Team at the show* multi-select of users (`GET /users`, managers and admins only).
2. **Event detail page:**
   - the team list, with "Edit team" for managers;
   - the summary as a small dashboard: leads by status and quality, captures waiting for review, and a per-member table;
   - "View leads" linking to the lead list filtered by `event_id`.

---

## 3. Capture screen (at the booth)

### 3.1 Show picker auto-selection

- On load, call `GET /events/current?on=<local date>`.
- **If `suggested_event_id` is set:** pre-select it.
  - This takes priority over "remember the last choice", **unless** the remembered show is still ongoing. Then keep it.
- **If it is null and there are ongoing shows:** list them first under "Happening now", with the user's own shows marked "You're on the team".
- Keep "Not from a show" as an option.

### 3.2 Header

At the top of the capture screen and the review screen, show the exhibition:
- name;
- stand (`booth`);
- dates (`date` – `end_date`);
- city or country.

**Where it comes from:**
- On the review screen, `capture.event` is now embedded: `{ id, name, date, end_date, location, country, booth }`.
- On the booth screen, use the selected `EventDetail`.
- When there is no show, say "Not at a show (office / factory visit)".

### 3.3 Everything else on the booth screen is unchanged

---

## 4. Review screen: pre-filled form, duplicates, more details

### 4.1 What `GET /captures/{id}` now returns

On the single-capture read only. These are null in lists, and for confirmed or discarded captures.

```
capture.event        { id, name, date, end_date, location, country, booth } | null
capture.created_by   { id, name } | null
capture.extracted    (bigger, see 4.4)
capture.suggestions  {
  products: [ { product_id, name, sku, category, score, matched_on: "workflow"|"mention"|"text",
                matched_term, quantity, note, mentions: [what the buyer said] } ],
  confirm_draft: { ...every field of POST /captures/{id}/confirm, pre-filled... },
  contact_phone_e164, contact_whatsapp_e164, phone_country,
  warnings: [ "Several phone numbers were read: ...", "Not in the catalogue: saffron", ... ]
}
capture.duplicates   DuplicateCheck (see 4.3)
```

### 4.2 Build the form from `suggestions.confirm_draft`

**Use `suggestions.confirm_draft` as the form's initial values**, not `extracted`. The draft already contains:
- the phone number cleaned to E.164, and the WhatsApp number (since `0009`: the main number unless the card names another; a second number on the card becomes `contact_alternate_phone`);
- the country, taken from the phone number when the card did not say it;
- all export details;
- `products` (pre-selected) and `product_id` (the main product);
- `owner_id`, defaulting to the rep who captured the lead;
- `event_id`;
- `quality_tag` (the rep's impression, if they said one);
- `next_follow_up_at` (the earliest date we promised something by);
- `notes`: a conversation summary note plus one commitment per promise, with due dates;
- `content` (the first message);
- `lead_resolution` and `lead_id`, taken from the duplicate check's recommendation;
- `request_research: true`.

**Rules:**
- Show `suggestions.warnings` as a yellow callout above the form.
- Keep the low-`confidence` highlighting from before (it uses `extracted.confidence`).
- When submitting, **omit null fields**, and send `event_id` only if the person changed it. Omitted keeps the capture's own show; `null` means "Not from a show".

### 4.3 Form sections

**A. Contact**
- Fields: name, phone, email, designation, **WhatsApp** (pre-filled with the phone number since `0009`), **alternate number** (since `0009`).

**B. Company**
- Fields: name, **country (select)**, **website**, location, industry.

**C. Enquiry**
- **Lead title.**
- **Requirement summary.**
- **Products: a multi-select with per-product quantity and note.**
  - Pre-select `suggestions.products`, each with a badge:
    - "Heard in voice note" when `matched_on` is `mention` or `workflow`;
    - "Mentioned in transcript" when it is `text`.
  - Show `mentions` as small grey text, for example *said: "haldi powder"*.
  - **The first product is the main one.** Let the user reorder or star it; that becomes `product_id`.
  - **Search as you type:** `GET /products/match?q=<text>&limit=5`. It understands aliases in other languages ("haldi", "elaichi", "jeera"), spelling slips and whole sentences. Discontinued products are never suggested.
  - Send it as `products: [{ product_id, quantity?, note? }]` plus `product_id`.

**D. More details** (a collapsible "Export details" section; open by default when any of its fields is set)

| Field | Request key | Control |
|---|---|---|
| Buyer type | `buyer_type` | select |
| Requirement type | `requirement_type` | select |
| Approximate volume | `approx_volume` | text, e.g. "2 x 20ft FCL per month" |
| Packaging | `packaging_requirement` | textarea |
| Destination market | `destination_market` | text |
| Samples requested | `samples_requested` | yes / no / unknown |
| Sample details | `sample_requirement` | text, shown when samples = yes |
| Expected timeline | `expected_timeline` | text |
| Target price | `target_price` | text, e.g. "USD 4.20/kg CIF Hamburg" |
| Incoterm | `incoterm` | select: EXW, FCA, FOB, CFR, CIF, CPT, CIP, DAP, DDP (free text accepted; the API upper-cases it) |
| Preferred contact channel | `preferred_contact_channel` | WhatsApp / Email / Call |
| Initial lead quality | `quality_tag` | Hot / Warm / Cold chips |
| Assigned seller | `owner_id` | user select (`GET /users`, if `users:read`; otherwise show the default, "You") |
| Next follow-up | `next_follow_up_at` | date-time |

MOQ belongs to the product, not to the lead. Show each selected product's `moq` as a hint next to it.

**E. Conversation notes**
- Show `confirm_draft.notes` as editable cards:
  - the **conversation summary**: who they are / what they need / what we promised / terms used;
  - **promises** (commitments), each with a due date.
- The rep can edit or remove them and add more.
- They are sent as `notes: [{ kind, body, due_at?, pinned? }]`.

**F. First message** (`content`)
- Pre-filled. Keep it.

**G. Transcript panel** (collapsible, next to the photo and the audio player)
- `extracted.transcript`: verbatim, in the original language, labelled with `transcript_language`.
- `extracted.transcript_english`: the translation.
- `extracted.conversation.glossary`: local terms, e.g. "haldi = turmeric".
- `extracted.card_text` (front) and **`extracted.card_back_text` (back, new; §00)**.

**H. Research toggle**
- "Research this lead after saving" (`request_research`, on by default).

### 4.4 Duplicates panel (above the form)

`capture.duplicates` (a `DuplicateCheck`):
```
{ contact: ContactBrief|null, matched_on: ["phone"|"email"|"whatsapp"], conflicting_contact,
  open_leads: [OpenLeadRead...], account: { account_id, name, country, status, score } | null,
  similar_contacts: [{ contact, account_name, reason }],
  other_captures: [{ capture_id, status, event_id, created_by_user_id, created_at, reason }],
  recommended_resolution: "new"|"attach", recommended_lead_id, recommendation_reason, is_likely_duplicate }
```

**When `is_likely_duplicate` is true**, show a prominent card:
- "Already in your contacts: *Anna Berg* (matched on email)";
- their open enquiries, with title, status and last messages;
- a radio choice: **Add to "<lead title>"** (`lead_resolution: "attach"`, `lead_id`) or **New enquiry** (`"new"`).
  - Pre-select according to `recommended_resolution`, and show `recommendation_reason` as the hint.

**`other_captures`:** "A teammate may have captured this person too (Same card photo, Arjun, 10:42)", with a link to that capture so one of the two can be discarded.

**`similar_contacts`:** a softer "Possibly the same person" list.

**`account.status`:**
- `needs_review`: "Probably the same company as *X*". Informational.
- `confirmed`: the existing company.

**Re-check as the reviewer edits:**
- When they change name, phone, email, WhatsApp, company or products, debounce about 600 ms and call `GET /captures/{id}/duplicates?name=&phone=&email=&whatsapp=&company=&product_id=...`. Omitted values fall back to the extraction.
- **Never** re-fetch `GET /captures/{id}` to do this: it would reset the form.

### 4.5 Confirm, then go to the lead

`POST /captures/{id}/confirm` now returns:
```
{ capture, lead: {...ingest response...}, redirect_lead_id, research_id }
```

**On success:**
1. Invalidate the captures and leads queries.
2. Show a toast: "Lead created".
3. **`router.replace('/leads/' + redirect_lead_id)`.**

**Error handling is unchanged.** On a `409` "already confirmed", go to `capture.lead_id`.

**New `422` cases:**
- "Unknown product(s): ...";
- "Cannot assign to an inactive user";
- country not a two-letter code.

**Defaults:**
- `owner_id` omitted: the lead goes to the rep who captured it.
- `owner_id: null` explicitly: the lead stays unassigned.

### 4.6 Captures queue

List rows now include `event` (name) and `created_by` (name). Show both; no extra fetches are needed.

---

## 5. Leads list (Flow 2: "all leads in one view")

### 5.1 Endpoints

| Call | Returns |
|---|---|
| `GET /leads/overview?<filters>&sort=&skip=&limit=` | `LeadListItem[]` (shape below). Total in `X-Total-Count`. **Use this for the list.** |
| `GET /leads/facets?<filters>` | Counts for the filter chips. Each dimension is counted with every *other* filter applied. |
| `GET /leads/regions` | `{ region: [country codes] }`, for the region picker. |
| `GET /leads?<filters>` | Same filters, plain `LeadRead[]`. Kept for existing code. |

**`LeadListItem`** = `LeadRead` plus:
```
contact { id, name, phone, email, whatsapp, designation }
account { id, name, country, region, website }
event { id, name, date, end_date, ... } | null
owner { id, name } | null
products: [names, main first]
last_activity_at, open_commitments (promises not done), research_status
```

### 5.2 Filters (query parameters; repeat a key for several values)

| UI filter | Parameters |
|---|---|
| Status: Not contacted / Contacted / Quotation requested (/ Won / Lost) | `stage=not_contacted&stage=contacted…`. `not_contacted` = new + uncontacted; `contacted` = in_conversation + stale. (Exact pipeline statuses: `status=`.) |
| Exhibition | `event_id=…` (repeatable); `has_event=false` = "Not from an exhibition" |
| Qualification score: ranges / categories | `qualification=hot\|warm\|cold\|unscored` (hot ≥ 70, warm 40–69, cold < 40) and/or `score_min=&score_max=` (0–100) |
| Person's own rating | `quality_tag=hot\|warm\|cold` |
| Date created: Today / Last 7 days / Last 30 days / custom | `created_from=<ISO with offset>` (inclusive), `created_to=` (exclusive) |
| Next follow-up: Overdue / Today / Next 7 days / custom / None | `follow_up_overdue=true` · `follow_up_from=&follow_up_to=` · `has_follow_up=false` |
| Country / Region | `country=DE&country=FR` · `region=europe&region=gcc_middle_east` (country and region are combined: either matches) |
| Owner | `owner_id=…` · `unassigned=true` |
| Product | `product_id=…` (main product **or** any linked product) |
| Source | `source=exhibition…` |
| Search | `q=` (≥ 2 characters): contact name, email, phone digits, company, lead title |

**Dates must be computed in the user's time zone.**
- "Today": `created_from` = local midnight, as ISO with offset; `created_to` = tomorrow's local midnight.
- "Last 7 days": `created_from` = local midnight 6 days ago; no `created_to`.

**Sort:** `sort=created_desc` (default) `| created_asc | updated_desc | score_desc | score_asc | follow_up_asc | name_asc`.

**Facets response:**
```
{ total, stage, status, event, country, region, qualification, quality_tag, owner }
```
- Each is a list of `{ value, label, count }`.
- A `value` of null means "not set": no show, no country, unassigned.

### 5.3 UI to build

**Layout:**
- **Desktop:** a filter bar on top, with chips that show counts from `/leads/facets`.
- **Phone:** a "Filters (n)" sheet.

**Table / card columns:**
- Contact and company (with a country flag);
- Exhibition;
- Status;
- **Score badge**: `qualification_score` with the `qualification_tag` colour, or "Not researched" / "Researching…" from `research_status`;
- Person's quality tag;
- Main product (+n);
- Owner;
- Next follow-up (red when overdue);
- Created.

**Behaviour:**
- **Saved views:** keep the filter state in the URL query string so views can be bookmarked and shared. Suggested quick views:
  - "My overdue follow-ups" (`owner_id=me&follow_up_overdue=true`);
  - "Hot, not contacted" (`qualification=hot&stage=not_contacted`);
  - "This show" (`event_id=<current>`).
- **Pagination:** use `X-Total-Count`.

---

## 6. Lead page (individual lead, with everything extracted)

### 6.1 One call: `GET /leads/{id}/context` → `LeadContext`

```
lead      (LeadRead incl. export details, next_follow_up_at, follow_ups_paused,
           qualification_score/tag/confidence, qualified_at)
contact   { id, name, phone, email, whatsapp, designation }
account   { ..., country, website }
event, owner
products  [ { product_id, name, sku, category, quantity, note, source, is_primary } ]
notes     [ LeadNoteRead ]   (pinned first, then newest)
touchpoints [ ...with attachments, as before ]
captures  [ CaptureRead ]    (the show capture: card, voice, extracted incl. transcript + translation)
research  ResearchRead | null  (newest run, any status)
last_activity_at
```

This is a superset of the old `{lead, contact, touchpoints}`, so existing code keeps working.

### 6.2 Sections

**1. Header**
- Contact name and designation, company with flag, exhibition chip, status (pipeline rail as today), owner, the person's quality tag.
- **Pause automated follow-ups** toggle: `PATCH /leads/{id}` with `{follow_ups_paused: true|false}`. While paused, n8n does not send cadence messages.

**2. Contact details**
- Name, email (mailto), **website** (link), phone (`tel:`), WhatsApp (`https://wa.me/<digits>`), designation, country.

**3. Export details**
- Every field from §4.3 D, plus each product's **MOQ** (from the catalogue: `GET /products/{id}`, or show it in the products list).
- Inline editable via `PATCH /leads/{id}`. All the fields from 4.3 D are accepted, and so are `next_follow_up_at` and `follow_ups_paused`.

**4. Products**
- List with a source badge (from voice note / added by hand / suggested by research) and quantity.
- Edit with `PUT /leads/{id}/products` `{ products: [{ product_id, quantity?, note? }] }`. This replaces the list; the first item is the main product.
- A product linked to a lead can no longer be deleted (`409`). Offer "Mark inactive" instead (`PATCH /products/{id}` `{is_active: false}`).

**5. Qualification (the screenshot)**: see §6.3.

**6. Notes and promises**
- `GET/POST /leads/{id}/notes`, `PATCH/DELETE /leads/{id}/notes/{note_id}`.
- Create: `{ kind: "note"|"conversation_summary"|"commitment", body, pinned?, due_at? }`.
  - A commitment with `due_at` also moves the lead's `next_follow_up_at` earlier, if it is sooner.
- Promises show a checkbox: `PATCH …` with `{completed: true}` sets `completed_at`; `false` re-opens it.
- `GET …/notes?open_commitments=true` lists the open promises.
- Pin or unpin with `{pinned: true}`.

**7. Conversation**
- Touchpoints with attachments, as before.

**8. From the show**
- The capture's card photos (`card` = front, `card_back` = back, either may be null), audio player, verbatim transcript, English translation, glossary and card text (`card_text`, `card_back_text`), from `captures[0]`.

**9. Quotations and samples**
- Unchanged.

### 6.3 Qualification panel (from the screenshot)

Data comes from `research.result`. Show it when `research.status == "completed"`.

| Screenshot element | Field |
|---|---|
| Big score "47 / 100" | `result.score` |
| `cold` / `warm` / `hot` pill | `result.quality_tag` (the API derives it from the score when n8n omits it) |
| "70% confidence" | `result.confidence` × 100 |
| Headline "Low product fit; tech firm, but tea inquiry." | `result.headline` |
| Paragraph under it | `result.summary` |
| Value potential / Purchase intent / Engagement / Information bars | `result.breakdown.value_potential`, `.purchase_intent`, `.engagement`, `.information_completeness`. **Also `.product_fit`** (add a 5th tile, or replace one). Each is 0–100, and any of them may be missing. |
| Score reasons | `result.score_reasons[]` |
| Confirmed facts | `result.confirmed_facts[]` |
| Possible inferences | `result.possible_inferences[]` |

**Also available, worth showing below:**
- `result.risks[]` (red flags);
- `result.product_matches[]` (`{product_id, name, fit: high|medium|low, reason}`), e.g. "Fits: Tulsi Green Tea (high)". High-fit products are also auto-added to the lead's products with source `research`;
- `result.recommended_next_action`;
- `result.suggested_questions[]` ("Ask them");
- `result.company` (`industry, size, founded, website, description, business_lines, current_suppliers_or_origins, social`);
- `result.contact` (`role, seniority, summary`);
- `result.sources[]` (`{title, url}`). **Always show sources** so the rep can verify.

**States:**
- **No research yet:** "Research this lead" → `POST /leads/{id}/research` (`201` when a new run is queued).
- **`requested` / `processing`:** "Researching… (usually a few minutes)". Poll `GET /leads/{id}/context` (or `GET /leads/{id}/research`) every 15 s while open.
- **`failed`:** show `research.error` and a "Try again" button (`POST …/research`).
- **`completed`:** the panel, plus "Research again" → `POST /leads/{id}/research` with `{"refresh": true}`.
- **History:** `GET /leads/{id}/research` lists every run, newest first (optional "previous results" drawer).

**Wording must make clear this is an AI suggestion.** `quality_tag` (Hot/Warm/Cold set by a person) stays the person's call. Show both, e.g. "AI score 47 (warm) · Your rating: —", with a one-click "Use AI rating", which is `POST /leads/{id}/score` `{quality_tag}`.

---

## 7. Manual "New lead" form and imports

- **Same "More details" section as §4.3 D.** `POST /leads/ingest` accepts all those keys, plus:
  - `contact_whatsapp`, `account_country`, `account_website`;
  - `products[]`, `quality_tag`, `owner_id`, `next_follow_up_at`;
  - `notes[]`.
- **Duplicate check while typing:** `GET /leads/duplicates?name=&phone=&email=&whatsapp=&company=&product_id=`. It returns the same `DuplicateCheck` as §4.4, without `other_captures`. Prefer it over `GET /leads/match` for UI forms; `/leads/match` stays for n8n.
- **Bulk import:** the same new keys are allowed per row. Optionally map extra Excel columns to them.

---

## 8. Settings and catalogue

### Settings → Organization

New fields (all `PATCH /organization`, admin):
- **Company profile** (`business_description`, up to 4000 characters). Help text: "Used by the AI to judge product fit."
- **Website** (`website`).
- **Research every new lead automatically** (`auto_research_new_leads`). Capture-confirmed leads are researched anyway, unless the reviewer unticks it.

### Catalogue → Product form

New fields:
- **Category** (`category`). Suggestions from `GET /products/categories`.
- **HS code** (`hs_code`).
- **Other names / aliases** (`aliases[]`, tag input). Help text: "Names buyers use in other languages, e.g. haldi, kurkuma. Used to recognise the product in voice notes."
- **Active** toggle (`is_active`).

### Product list

`GET /products` gained `?q=`, `?category=` and `?active=true|false`. This fixes the old "scan 200 records" search limitation for products.

---

## 9. Compatibility notes (check these)

1. **`ContactBrief` has two extra fields** (`whatsapp`, `designation`) everywhere it appears. Exact-match tests may need updating.
2. **`GET /leads` filter parameters are now lists** (`status`, `event_id`, `owner_id`, `source`, `quality_tag`, `product_id`). One value still works exactly as before.
3. **`GET/POST/PATCH /events` return `EventDetail`**, which is `EventRead` plus `timing` and `members`.
4. **New `422`s** on ingest and confirm: unknown `products[].product_id`; an inactive `owner_id`; `account_country` not a two-letter code.
5. **New permission `research:process`** exists, for n8n only. People never need it. Asking for research is `leads:write`; reading it is `leads:read`.
6. **(`0008`) A confirmed capture's touchpoint may carry two images** (front and back of the card) plus the voice note. Code or tests that assume one image per touchpoint, or at most two attachments, need updating. `CaptureRead` has the new nullable `card_back`.

---

## 10. Demo data (organization "Refynd Labs", slug `demo`)

### What is loaded

Refynd Labs is presented as a fictional Bengaluru exporter of herbal teas, spices and botanicals. Loaded with `uv run python -m app.cli seed-demo --slug demo` on the API side:

- **Team:** Priya Raman (manager), Arjun Mehta, Fatima Sheikh, Karthik Rao, Meera Iyer (execs).
  - Their passwords are in the API repo's `seed-credentials.local.txt` (gitignored).
  - The admin can reset them in Settings → Team.
- **Catalogue:** 24 products, with categories, HS codes, multilingual aliases, MOQ, packaging, certifications and some variants. One is inactive.
- **Exhibitions:** 5 shows.
  - **"India International Tea & Spice Expo 2026"** runs 8–11 Oct 2026 (ongoing). The admin, Arjun and Fatima are on its team.
  - SIAL Paris, Gulfood, BIOFACH are upcoming; World Tea Expo is past.
- **Knowledge:** 6 FAQs and 3 catalogue documents.
- **Leads:** 12 leads across every stage and many countries, with export details, products, notes and promises (some overdue).
  - 3 have completed research. One reproduces the screenshot: Naysheel Kant, 47/100, warm.

### Safety

- All demo contacts use `.example` email domains and fictional phone ranges.
- They have **automated follow-ups paused**, so n8n never messages them.
- The organization's earlier real leads are untouched.

---

## 11. Suggested build order

1. Regenerate types and add the enums. **Two-sided cards (§00) are small and independent; fit them in anywhere.**
2. Lead page: context, details editing, notes, products, qualification panel.
3. Lead list: overview, facets, filters in the URL.
4. Review screen: draft pre-fill, products, more details, notes, duplicates, redirect.
5. Capture screen auto-selection and header.
6. Exhibitions: dates, team, summary.
7. Settings and catalogue fields.
8. Manual form duplicates.

Add Playwright cases for:
- the review-to-lead redirect;
- a filter round-trip through the URL;
- the qualification panel states (none / researching / failed / completed);
- a two-sided card: front and back uploaded, both shown on review and on the lead page.
