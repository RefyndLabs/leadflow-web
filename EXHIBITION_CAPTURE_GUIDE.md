# Capture at a show: photo, voice note, review, lead

How a rep at an exhibition turns a business card and a few spoken words into a lead, and exactly what the API, the web app (UI) and n8n each do. This replaces the earlier "paste a link to the file" idea: **the files now go into the API itself.**

Read part 1 for the picture, part 2 for the API contract (the source of truth for field names is still `openapi.json`), **part 3 if you are building the UI**, **part 4 if you are building the n8n workflow**.

---

## 1. The flow

```
 REP (phone browser)                    API                          n8n (extraction workflow)
 ───────────────────                    ───                          ─────────────────────────
 1. pick the show
 2. take a photo of the card  ─────▶  POST /captures
    (camera, or choose a file)        POST /captures/{id}/card
 3. press the mic, talk       ─────▶  POST /captures/{id}/voice
 4. tap "Done"                ─────▶  POST /captures/{id}/submit    status = submitted
                                                                    every minute:
                                       GET  /captures?status=submitted ◀──── poll
                                       POST /captures/{id}/claim       ◀──── take one   (processing)
                                       GET  /attachments/{id}/content  ◀──── download card + voice
                                                                    OCR the card, transcribe the voice,
                                                                    extract the fields (LLM)
                                       POST /captures/{id}/extraction  ◀──── suggested fields (ready_for_review)
 5. open the capture, see the
    suggested fields next to the
    photo, fix them             ─────▶  POST /captures/{id}/confirm   → lead created, status = confirmed
```

Things worth knowing:

- **A person always confirms.** Extraction only *suggests*; nothing becomes a lead until a human presses confirm (this is a product rule from the original spec: OCR/voice extraction is noisy).
- **A failed extraction never blocks a lead.** If n8n is down or the card is unreadable, the rep can still type the details and confirm. Captures can be confirmed from any open state.
- **The API never calls n8n.** It only waits to be polled, like `/cadences/due`. So n8n needs no inbound webhook, and the API needs no n8n address or secret.
- **Fast at a booth.** Capturing is just step 2-4 and takes seconds; review happens later from the queue, from any phone or laptop.
- **After confirming**, the card photo and the voice note are attached to the lead's first message (a touchpoint, channel `exhibition`) and show up in the lead's conversation. For a new lead, a personalised first message *to the buyer* is also queued (migration `0009`): AI writes it from the voice note, typed note and card, and a person approves it on the lead page.

---

## 2. API contract

### 2.1 Permissions

| Permission | Who | What it allows |
|---|---|---|
| `captures:write` | people (exec, manager, admin) | create, upload, submit, discard, confirm |
| `captures:read` | people | list/read captures, download their files |
| `captures:process` | **API key only** (n8n); also admins | list, claim, download, report the extraction |
| `leads:read` | anyone who has it | can also download the files attached to a lead |

`captures:process` is the only new permission an API key can hold. A key can never create, submit, discard or confirm (`403`): a person decides. Captures are visible to everyone in the organization who has `captures:read` (a teammate can finish a colleague's review); every action is in the audit log with who did it.

### 2.2 Status lifecycle

```
draft ──submit──▶ submitted ──claim──▶ processing ──extraction──▶ ready_for_review ──confirm──▶ confirmed
  ▲                                        │  └──fail──▶ failed ──submit (retry)──▶ submitted
  └──── replace/remove a file, or edit ────┘ (from draft / ready_for_review / failed)
any open status ──discard──▶ discarded            any open status ──confirm──▶ confirmed
```

Editing a capture or changing a file is allowed only in `draft`, `ready_for_review` and `failed` (otherwise `409`), and it puts the capture back to `draft` (the old extraction no longer describes it). A capture claimed (`processing`) for more than 15 minutes (`CAPTURE_PROCESSING_LEASE_MINUTES`) can be claimed again, so a crashed workflow run never strands one.

### 2.3 Endpoints

| Method and path | Permission | Notes |
|---|---|---|
| `POST /captures` `{event_id?, note?}` | captures:write | Starts a `draft`. `event_id` must be one of the organization's events. |
| `GET /captures?status=&event_id=&created_by_user_id=&oldest_first=&skip=&limit=` | captures:read or :process | Newest first (`oldest_first=true` for a queue). `X-Total-Count` header. |
| `GET /captures/{id}` | captures:read or :process | Full capture, see 2.4. |
| `PATCH /captures/{id}` `{event_id?, note?}` | captures:write | Editable states only. |
| `POST /captures/{id}/card` | captures:write | The **front** of the card. **multipart/form-data**, one part named `file`. Replaces any earlier front. |
| `POST /captures/{id}/card-back` | captures:write | The **back** of the card (optional; since migration `0008`). Same rules as the front. Replaces any earlier back. |
| `POST /captures/{id}/voice` | captures:write | **multipart/form-data**, one part named `file`. Replaces any earlier recording. |
| `DELETE /captures/{id}/card`, `/card-back` and `/voice` | captures:write | Removes the file (rep wants to retake). `204`. |
| `POST /captures/{id}/submit` | captures:write | Queue for extraction; also the retry after `failed`. `422` if there is no card photo (front or back) and no voice note. |
| `POST /captures/{id}/discard` | captures:write | Gives up; **deletes the photos and recording**. |
| `POST /captures/{id}/confirm` | captures:write | Creates the lead, see 2.5. |
| `POST /captures/{id}/claim` | captures:process | `submitted` -> `processing`. `409` if someone else has it. |
| `POST /captures/{id}/extraction` `{extracted: {...}}` | captures:process | `processing` -> `ready_for_review`, see 2.6. |
| `POST /captures/{id}/fail` `{error}` | captures:process | `processing` -> `failed`. |
| `GET /attachments/{id}` | captures:read, :process or leads:read | Metadata. |
| `GET /attachments/{id}/content` | captures:read, :process or leads:read | The file. Supports `Range`. |

Uploads are rate limited (30 per minute per caller, `UPLOAD_RATE_LIMIT`).

### 2.4 What a capture looks like

```json
{
  "id": "…", "status": "ready_for_review", "event_id": "…", "created_by_user_id": "…",
  "note": "booth 14, call back Tuesday",
  "card":  { "id": "…", "kind": "image", "content_type": "image/jpeg", "size_bytes": 412345, "width": 1707, "height": 2560, "created_at": "…" },
  "card_back": null,
  "voice": { "id": "…", "kind": "audio", "content_type": "audio/webm", "size_bytes": 98123, "width": null, "height": null, "created_at": "…" },
  "extracted": { "contact_name": "Mr Lee", "…": "see 2.6" },
  "extraction_error": null, "processing_started_at": null,
  "lead_id": null, "confirmed_at": null, "created_at": "…", "updated_at": "…"
}
```
`card` (front) / `card_back` (back) / `voice` / `extracted` are `null` until they exist. Uploading or removing any file sends the capture back to `draft` (its extraction is cleared).

### 2.5 Confirming

`POST /captures/{id}/confirm`, body = the **reviewed** details. Same matching, lead-resolution and validation rules as `POST /leads/ingest` (see `N8N_INTEGRATION_GUIDE.md` §2), minus `source` (decided by the exhibition, see below) and `touchpoint`:

```json
{
  "contact_name": "Mr Lee",
  "contact_phone": "+65 9123 4567",
  "contact_email": null,
  "contact_designation": "Director",
  "account_name": "Lee Trading Pte Ltd",
  "account_domain": null, "account_industry": null, "account_location": "Singapore",
  "division": null, "product_id": null,
  "lead_resolution": "auto",
  "lead_id": null,
  "lead_title": "Cotton yarn 30s combed",
  "requirement_summary": "10 tons a month, wants samples",
  "event_id": null,
  "content": "Interested in 30s combed yarn, wants samples before ordering."
}
```
- Needs `contact_name`, `account_name` and a phone **or** an email. Unknown fields are rejected (`422`).
- `event_id` is **optional**. Omit the key to keep the capture's own exhibition; send `"event_id": null` for "not from a show"; send an id to set or change it.
- **Source:** with an exhibition the lead's source and its first message's channel are `exhibition`; without one (office or factory visit, walk-in, meeting) they are `in_person`. So "Capture" also works away from shows.
- `content` becomes the text of the lead's first message. If omitted, the capture's typed `note` is used.
- The card photos (front and back) and voice note become attachments of that message.
- Response: `{ "capture": {…confirmed, with lead_id…}, "lead": {…the ingest response: lead_id, contact_id, is_new_lead, lead_resolution_applied, contact_review_status…} }`.
- Confirm twice and the second is `409`. If it fails (422/404/409) nothing is created and the capture stays open.

### 2.6 What the extraction workflow posts

`POST /captures/{id}/extraction` with `{ "extracted": { … } }`. Every field is optional; **unknown fields are rejected (`422`)**, so put anything else under `other`.

| Field | Type | Notes |
|---|---|---|
| `contact_name`, `contact_designation` | string | |
| `contact_phone`, `contact_email` | string | Exactly as read; may be messy. The person fixes it. |
| `account_name`, `account_domain`, `account_industry`, `account_location` | string | |
| `lead_title` (≤200), `requirement_summary` (≤4000), `next_steps` (≤4000), `product_hint` | string | `product_hint` is free text, not an id. |
| `card_text` (≤20 000) | string | The full text OCR read off the card (the front). Shown to the reviewer. |
| `card_back_text` (≤20 000) | string | The text read off the back of the card, when there is a back photo. Shown to the reviewer. |
| `transcript` (≤50 000), `transcript_language` | string | The full speech-to-text. Shown to the reviewer. |
| `confidence` | `{field: 0..1}` | Optional, at most 40 entries. |
| `other` | `{string: string}` | Website, fax, address line, anything else. At most 30 entries. |

### 2.7 Files: what is accepted, what is stored

| | Photo (`/card`) | Voice note (`/voice`) |
|---|---|---|
| Accepted | JPEG, PNG, WebP, GIF, BMP (any filename, any claimed type) | webm, ogg, mp4/m4a, wav, mp3, flac, aac |
| Not accepted (`415`) | HEIC/HEIF, TIFF, SVG, PDF, anything that is not really an image | anything that is not really audio |
| Checked how | The file is **decoded** and re-encoded | Its **header bytes** are identified |
| Stored as | **A JPEG**, longest side at most 2560 px, upright, **without EXIF** (no GPS/device data) | **Exactly as recorded** |
| Size limits | 16 MB upload, 50 megapixels (`413` otherwise) | 16 MB upload |

The `content_type` of the stored file is decided by the API from the bytes, never from what the client claimed. Corrupt/truncated photos are `422`. A file part is always named `file`.

Downloads: `GET /attachments/{id}/content` returns the bytes with that content type, `Content-Disposition: inline`, `Accept-Ranges: bytes` and `206` for `Range` requests (Safari needs this to play audio). **Browsers cannot send an `Authorization` header from `<img>`/`<audio>`**, so the web app must fetch files through its own server (see 3.4).

### 2.8 Errors you will see

`401` not logged in · `403` missing permission · `404` not found (also when it belongs to another organization) · `409` wrong status for this action, or already confirmed · `413` too big (file bytes or pixels) · `415` not a supported photo/recording · `422` validation (missing details, empty file, damaged photo, unknown field). All as `{"detail": "..."}`; the 415/422 messages are written for people and can be shown as they are.

---

## 3. UI: what to build and change

(Stack assumed: Next.js App Router, httpOnly-cookie auth through your own server, TanStack Query, as in `FRONTEND_BUILD_GUIDE.md`.)

### 3.1 Replace the old exhibition form

Remove the "enter fields, paste a file link, submit to `/leads/ingest`" screen from `FRONTEND_BUILD_GUIDE.md` §5.11, **and the presigned-S3 upload plan** (no S3, no AWS SDK, no `raw_source_ref` link for show captures). Events CRUD stays. Build three screens:

**A. "Capture" screen (the one used at the booth — optimize for speed and one thumb)**
1. **Show picker** at the top (remember the last choice). Calls `GET /events`; the selected `event_id` goes into `POST /captures`. If there are no events, offer to create one if the user may.
2. **Card photo** — two buttons side by side:
   - **Take photo** → opens the phone camera (see 3.2). 
   - **Choose a file** → file picker for JPG/PNG/WebP.
   After a photo exists show a preview with **Retake**.
3. **Voice note** — one big microphone button (see 3.3). After recording show an audio player to listen back, with **Re-record**.
4. An optional one-line **note** text box.
5. **Done** button → `POST /captures`, then `/card`, then `/voice` (whichever exist), then `/submit`. Show per-file progress, keep the screen usable, and on a failed request keep what was captured in memory so a retry is one tap (do not lose a card because the network blinked). After success: a "Saved ✓ — capture another" state that resets the screen but keeps the show selected.
6. Allow submitting with only a card, only a voice note, or only a note (a note-only capture can be created and confirmed later; it is not submitted for extraction).

**B. "Captures" queue (review list)**
- `GET /captures` (default newest first; filter by show, by status, "mine"). Row: thumbnail of the card (fetch `/attachments/{card.id}/content` through your server route), who/when, status badge with plain wording: draft = "Not sent", submitted/processing = "Reading…", ready_for_review = "Ready to review", failed = "Couldn't read — add details by hand", confirmed = "Lead created" (link to the lead), discarded.
- Poll or refetch (every ~15 s while any row is submitted/processing; TanStack Query `refetchInterval`).

**C. "Review capture" screen**
- Left/top: the **card photo** (zoomable) and an **audio player** for the voice note. Below: the extraction's raw `card_text` and `transcript` (collapsible), and `extraction_error` if any.
- A **form pre-filled from `extracted`**, every field editable: contact name/phone/email/designation, company name/domain/industry/location, lead title, requirement summary, and `content` ("what was discussed/needed" — pre-fill from `requirement_summary` + `next_steps`). Mark fields with low `confidence` (< 0.6) so the reviewer looks at them first. Phone numbers from OCR may hold two numbers or junk: let the person pick/clean one. (Since migration `0009` the review draft already does this: the first number is the phone, the second the **alternate number**, and WhatsApp is the main number unless the card names another.)
- **Duplicate check before confirming:** call `GET /leads/match?phone=…&email=…&company=…` with the entered values. If the contact has open leads, show them and let the rep choose "add to this lead" (`lead_resolution: "attach"` + `lead_id`) or "new enquiry" (`"new"`), as described in `FRONTEND_BUILD_GUIDE.md` §5.9.
- **Confirm lead** → `POST /captures/{id}/confirm` with the form values. On success go to the new lead. Map errors: `422` field messages inline; `409` "already confirmed" → open the lead (`capture.lead_id` from `GET /captures/{id}`).
- Secondary actions: **Discard** (confirm dialog: "this deletes the photo and recording"), **Retry reading** (`POST /submit`, shown when `failed` or `ready_for_review`), and for `failed`/`draft` captures the form simply starts empty — a person can always type it in.
- A capture in `processing`/`submitted` can still be confirmed by hand (the form opens empty); say so ("You don't have to wait").

### 3.2 Taking a photo with the camera (and from a file)

Use the simplest thing that works on phones:

```html
<input type="file" accept="image/*" capture="environment" />   <!-- opens the camera -->
<input type="file" accept="image/jpeg,image/png,image/webp" />  <!-- gallery / files -->
```
- `capture="environment"` makes mobile browsers open the **rear camera** directly. On desktop it just opens a file chooser, so also keep a normal file input. This needs no permission prompt of your own, works over plain HTTPS, and works on iOS Safari and Android Chrome. **Prefer this.**
- If product wants an in-page live preview with a shutter button, use `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })`, draw a frame to a `<canvas>` and `canvas.toBlob(cb, "image/jpeg", 0.9)`. It needs a secure context (HTTPS or localhost), a user gesture, and handling of `NotAllowedError` ("Allow camera access in your browser settings") and `NotFoundError`. Stop the stream's tracks when done.
- Optional but recommended on mobile data: downscale before upload (longest side 2560 px, JPEG quality ~0.85) with `createImageBitmap` + canvas. The API shrinks anyway; this just saves upload time. Do **not** try to read/strip EXIF yourself.
- Upload as `multipart/form-data` with one part named **`file`** (`FormData.append("file", blob, "card.jpg")`). Do not set the `Content-Type` header yourself (the browser adds the boundary).
- HEIC: iOS usually converts to JPEG when `accept` is `image/*`. If a user does hit `415`, show the API message ("Use a JPEG, PNG or WebP image").

### 3.3 The voice button ("press and start talking")

Use `MediaRecorder`:

1. On first tap: `navigator.mediaDevices.getUserMedia({ audio: true })` (from the click handler, HTTPS only). Handle denial with a clear message and a link-style hint on how to enable the microphone.
2. Pick a supported format: first of `["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]` for which `MediaRecorder.isTypeSupported(type)` is true (Chrome/Edge/Firefox use webm/ogg; **Safari uses mp4**). Don't hard-code one. Don't force a `mimeType` if none matches; let the browser choose.
3. **Behaviour:** the simplest reliable UX is **tap to start, tap to stop** (large button, pulsing red while recording, running timer, optional level meter). Press-and-hold is possible but unreliable on mobile (long-press menus, accidental release); if you want it, offer tap-to-toggle as well. Cap length at ~3 minutes and auto-stop with a message.
4. Collect chunks with `recorder.ondataavailable`, and build a `Blob` on `onstop` (`new Blob(chunks, { type: recorder.mimeType })`). Stop all tracks afterwards (`stream.getTracks().forEach(t => t.stop())`) so the browser's recording indicator turns off.
5. Show a player (`<audio controls src={URL.createObjectURL(blob)}>`) so the rep can listen and **Re-record** before sending. Revoke the object URL when done.
6. Upload as `multipart/form-data`, part `file`, e.g. `form.append("file", blob, "voice-note.webm")` (the extension does not matter; the API reads the bytes). Stay under 16 MB (3 minutes of opus is far below).
7. Keep the screen awake while recording if you can (`navigator.wakeLock`), and warn if the tab is backgrounded (some mobile browsers stop recording).
8. If `MediaRecorder` is missing (very old browsers), fall back to a plain file input `accept="audio/*"` (on phones this also offers "record").

### 3.4 Wiring: how files travel through your Next.js server

Because auth is in httpOnly cookies (see `FRONTEND_BUILD_GUIDE.md` §2-3), the browser never calls the API directly; **uploads and downloads go through Route Handlers that add the `Authorization: Bearer …` header.**

- **Upload route** (e.g. `app/api/captures/[id]/card/route.ts`, same for `voice`): read the cookie, then forward the request body to `POST {API_URL}/captures/{id}/card` **without buffering or re-encoding** — pass `request.body` as a stream with `duplex: "half"`, and copy the `Content-Type` header (it carries the multipart boundary). Don't convert to JSON/base64. Raise Next.js's default body limits for these two routes (route handlers are fine with streaming; if you proxy through `next.config` rewrites or middleware, make sure no 1 MB/4 MB default applies). Return the API's JSON/status unchanged so the UI can show its error message.
- **Download route** (e.g. `app/api/attachments/[id]/route.ts`): fetch `GET {API_URL}/attachments/{id}/content`, **forward the incoming `Range` header** and return the status (`200`/`206`), `Content-Type`, `Content-Range`, `Accept-Ranges`, `Content-Length` and the body as a stream. Then `<img src="/api/attachments/ID">` and `<audio src="/api/attachments/ID" controls>` just work (same-origin, cookie auth), including seeking, and Safari plays the audio. Set a short private cache (`Cache-Control: private, max-age=300`) on this route if you want faster thumbnails; the API itself sends `no-store`.
- The rate limit sees your server's address (see `FRONTEND_BUILD_GUIDE.md` §2.2): uploads are limited to 30/minute, plenty for a booth, but remember it applies to everyone sharing that address.
- **Browser permissions policy:** the API's own responses forbid camera/microphone, but that applies to the API only. **Your Next.js app must allow them for its own pages**, otherwise the camera/mic prompts never appear: send `Permissions-Policy: camera=(self), microphone=(self)` from the app (`headers()` in `next.config`), and never embed the capture page in an iframe that lacks `allow="camera; microphone"`.
- HTTPS is required for camera and microphone on any real device (localhost is exempt for development). Testing on a phone against a dev server therefore needs an HTTPS URL (a tunnel, or your staging domain).

### 3.5 Show the files in the lead's conversation

Everywhere you render a lead's messages (`GET /leads/{id}/context`, `GET /leads/{id}/touchpoints`, `GET /contacts/{id}/context`), each touchpoint now has `attachments: [{id, kind, content_type, size_bytes, width, height, created_at}]`. Render `kind: "image"` as a thumbnail that opens full size, `kind: "audio"` as an audio player, both through the download route above. Old messages simply have an empty list.

### 3.6 Access control and navigation

Gate the Capture and Captures screens on `captures:write` / `captures:read` from `/auth/me` (execs have both). Reviewing and confirming needs `captures:write`. Admins also see everything; nobody needs `captures:process` in the UI (that is n8n's).

### 3.7 Other changes to the existing UI guide

- `FRONTEND_BUILD_GUIDE.md` §9 ("What NOT to build") said file storage is out of scope: that is now only true for catalogue/collateral `file_url` links; show-capture photos and voice notes are stored by the API.
- Add `CaptureStatus` (`draft, submitted, processing, ready_for_review, failed, confirmed, discarded`) and `AttachmentKind` (`image, audio`) to the enums.
- `TouchpointRead` gained `attachments`; `LeadRead` gained nothing new for this.
- Regenerate your types from the new `openapi.json`.

---

## 4. n8n: what to build and change

### 4.1 One new workflow: "Show capture extraction"

**Credential:** an API key created by an admin with exactly one scope:

```
POST /service-api-keys   {"name": "n8n show capture", "scopes": ["captures:process"]}
```
Store it as an `X-API-Key` Header Auth credential (separate from your lead-intake key, so each can be revoked on its own).

**Trigger:** Schedule, every 1 minute. (Poll, because the API never calls n8n.) Enable "execute workflow once at a time" or rely on the claim step below; both are safe together.

**Nodes:**

| # | Node | What it does |
|---|---|---|
| 1 | **HTTP Request** `GET {{BASE_URL}}/captures` query `status=submitted`, `oldest_first=true`, `limit=5` | The queue. Empty list ends the run. |
| 2 | **Split Out / Loop** over the items | One capture at a time. |
| 3 | **HTTP Request** `POST /captures/{{id}}/claim`, **Continue on fail** | Takes it. `409` means another run has it: skip silently. The response contains `card` and `voice` (each may be `null`). |
| 4 | **IF** `card` is not empty → **HTTP Request** `GET /attachments/{{card.id}}/content`, *Response format: File* | Download the photo (always a JPEG, ≤2560 px, upright: ideal for OCR/vision). |
| 5 | **OCR / vision** | Either a vision-capable LLM node ("read this business card, return the text and fields") or your OCR service. Output: the raw text and the fields. |
| 6 | **IF** `voice` is not empty → **HTTP Request** `GET /attachments/{{voice.id}}/content`, *Response format: File* | The recording as the browser made it: webm/opus (Chrome), mp4/aac (Safari), ogg (Firefox). |
| 7 | **Speech-to-text** (e.g. OpenAI Whisper node/API) | Accepts webm, mp4/m4a, ogg, wav, mp3 and flac up to 25 MB, so no conversion is needed. **Let it auto-detect the language** (reps speak in many languages). Output: transcript + language. |
| 8 | **LLM extraction** | Input: card text + transcript (+ the capture's `note`). Output: strict JSON in the shape of 2.6. Tell the model: use `null`/omit what is not stated, do not invent, keep the phone exactly as read, put website/address/other under `other`, write `requirement_summary` in English even if the audio was not (and keep the original in `transcript`), fill `lead_title` with a short product-and-need phrase. Use a JSON-schema / structured-output mode and then a **Code node** that deletes any key not in the allowed list (an extra key is a `422`). |
| 9 | **HTTP Request** `POST /captures/{{id}}/extraction` body `{"extracted": {…}}` | Hands it to the people. Status becomes `ready_for_review`. |
| 10 | **Error branch** (Error Trigger or "On error → continue") → `POST /captures/{{id}}/fail` body `{"error": "short reason"}` | If OCR/STT/LLM failed, report it so the rep sees "couldn't read, add details by hand" and can retry. Don't leave it in `processing` (it would only be handed out again after 15 minutes). |

Notes:
- A capture may have only a card, only a voice note, or neither (a note-only capture is never submitted). Handle every combination: skip the branch that has no file; still call `/extraction` with whatever you got (even just `{"extracted": {"card_text": "…"}}`).
- `409` on `/extraction` or `/fail` means the capture is no longer `processing` (a person discarded or confirmed it in the meantime, or another run already posted a result): log it and move on, it is not an error in your flow.
- Delay is at most the polling interval plus processing time; showing "Reading…" in the UI covers it.
- Keep the card/voice binaries in n8n only for the run. The API is the system of record.

### 4.2 Change the existing flows

- **Remove the old "exhibition pipeline"** described in `N8N_INTEGRATION_GUIDE.md` §5 (n8n receiving the photo/voice some other way, doing OCR, asking a human, then calling `/leads/ingest` with `source: "exhibition"` and a link in `raw_source_ref`). The UI confirm step now creates exhibition leads. **Do not call `/leads/ingest` for exhibition leads any more.** (Other channels are unchanged.)
- If you previously had a WhatsApp number for sending card photos, that is not part of this flow; it can be added later as another way of *creating a capture*, but that needs a `captures:write`-style permission that keys deliberately do not have today (ask before building it).
- **Scheduled housekeeping is unchanged**: `/cadences/due` and `/leads/sweep-stale` flows need nothing. Exhibition leads join them normally once confirmed (their first message is inbound, channel `exhibition`).
- Re-check lead follow-up templates: an exhibition lead's contact may have only a phone, only an email, or both (see `/cadences/due` `contact` and `last_inbound_at`). A WhatsApp contact made at a show has never written to you on WhatsApp, so the 24-hour reply window does not apply: use an approved template for the first outbound message. (Since migration `0009` that first message is the **personalised first touch**: queued on confirm, written by AI, approved on the lead page, sent through the `leadflow_first_touch` template; see `HANDOFF_N8N_FIRST_TOUCH.md`.)

---

## 5. Operating it

- **Storage and backups.** Photos and recordings live **in Postgres** (so tenant isolation, audit, the encrypted backups and the weekly restore test all cover them). A capture is roughly 0.3-3 MB (photo) plus 0.1-2 MB (voice). 1,000 captures is a few GB; backups grow with it. If it grows past what a single VPS comfortably holds (tens of GB), the next step is moving files to S3-compatible object storage behind the same API (the API's contract would not change). There is no per-organization storage quota yet.
- **Reverse proxy.** Caddy now allows ~18 MB bodies only on `POST /captures/{id}/card|card-back|voice` and keeps 9 MB everywhere else (`deploy/Caddyfile`). After pulling this change: `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d caddy api migrate` (the `migrate` job adds the two tables).
- **Housekeeping.** `python -m app.cli purge-expired` (schedule it daily, see `docs/OPERATIONS.md`) now also deletes capture drafts untouched for 14 days (`CAPTURE_DRAFT_RETENTION_DAYS`) together with their files. Discarding a capture deletes its files immediately. Confirmed captures keep their files (they belong to the lead's conversation) until the organization is offboarded.
- **Export / offboarding.** `export-org --slug X --output x.json --files-dir x-files` also writes every photo and recording to a folder (they are not embedded in the JSON). `offboard-org` deletes them with everything else.
- **Privacy.** A voice recording of a named person and a photo of their card are personal data. Tell reps to say at the start that the note is being recorded for follow-up, and keep the retention you promise (discard removes the files for good; the audit log keeps only that it happened, never the file).
- **Limits you can tune** (environment variables): `MAX_UPLOAD_BYTES` (16 MB), `UPLOAD_RATE_LIMIT` (`30/minute`), `MAX_IMAGE_PIXELS` (50 000 000), `IMAGE_MAX_DIMENSION` (2560), `CAPTURE_PROCESSING_LEASE_MINUTES` (15), `CAPTURE_DRAFT_RETENTION_DAYS` (14). If you raise `MAX_UPLOAD_BYTES`, raise the two numbers in `deploy/Caddyfile` too.

## 6. What this does not do

- No transcoding or audio length check: a recording is stored as sent (the 16 MB cap is the limit).
- No virus scanning: photos are re-encoded (which removes anything hidden in them), but audio is stored as received. It is never executed or served with a type the client chose, only downloaded by authenticated users of the same organization.
- No thumbnails: the UI scales the stored photo. Add a small-size variant later if lists feel heavy on mobile data.
- No offline queue: if the phone has no signal the capture waits in the page's memory (3.1); closing the tab loses it. A service-worker/IndexedDB queue is a good next step if shows have bad reception.
- HEIC is refused rather than converted.
