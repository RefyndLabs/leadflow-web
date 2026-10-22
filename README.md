# Leadflow web

The sales team's UI for the Leadflow API: leads and conversations, follow-ups, catalog, exhibitions, and the admin area. Next.js (App Router) + TypeScript, Tailwind, TanStack Query, React Hook Form + Zod. The visual design is a deliberately quiet placeholder; the functionality is meant to be complete.

Read alongside `PROJECT_CONTEXT.md` (product), `PROJECT_STATUS.md` (API) and, in the API repo, `STATUS_UI.md` (the app's status and the API contract it uses). Deployed on Vercel from `main`: `https://leadflow-web-mauve.vercel.app`, against the API on Render.

## Run it

```bash
pnpm install
cp .env.example .env.local        # set API_URL and SESSION_SECRET (see below)
pnpm dev                          # http://localhost:3000
```

No API handy? A faithful in-memory stand-in ships with the e2e tests:

```bash
pnpm mock-api                     # http://127.0.0.1:4010 — API_URL=http://127.0.0.1:4010
                                  # sign in with admin@example.com / "correct horse battery staple 1!"
```

| Script | What it does |
|---|---|
| `pnpm check` | typecheck + lint + unit tests |
| `pnpm test` | Vitest (181 tests: schema drift vs `openapi.json`, gateway allow-list, CSRF, session, refresh single-flight, lead-list URL → query, parsing, contact cards) |
| `pnpm build && pnpm test:e2e` | Playwright against the production build and the mock API (51 tests: desktop + phone, light + dark, axe accessibility on every route) |
| `pnpm gen:api` | regenerate `src/lib/api/schema.d.ts` from `openapi.json` |

Environment (`.env.example` lists all of it): `API_URL` and `SESSION_SECRET` are required; `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` enable error tracking. **`API_URL` is server-only** — the browser never learns the API's address.

## How it fits together

```
Browser ── same-origin, httpOnly cookie ──▶ Next.js server ── Authorization: Bearer ──▶ Leadflow API
                                            /api/auth/*  login, logout
                                            /api/lf/*    allow-listed gateway to the API
                                            /api/captures/*  streams card photo (front, back) / voice uploads to the API
                                            /api/attachments/* streams stored photos and recordings back (Range supported)
```

- **The browser only talks to this app.** TanStack Query fetchers call `/api/lf/*`; that route reads the session cookie, attaches the bearer token and forwards. Tokens never reach client JS.
- **Session cookie** = the API's access + refresh tokens, AES-256-GCM encrypted (`SESSION_SECRET`), `httpOnly`, `SameSite=Lax`, and in production `Secure` with the `__Host-` prefix.
- **Refresh** is proactive (inside the last 60 s of the 15-minute token) with one reactive retry on a 401. Refresh tokens are single-use, so refreshes are **single-flight per token** and the outcome is shared for 60 s with requests still carrying the old cookie. Tested: 12 parallel requests on an expiring token cause exactly one refresh and the API never sees a replay. Any refresh rejection ends the session (the API returns a plain 401 for expired, invalid *and* reused tokens — no `token_reuse_detected` code exists to key off); an API outage during refresh does *not* log anyone out.
- **CSRF**: `SameSite=Lax` + `Origin`/`Sec-Fetch-Site` check + a custom header on every state-changing route.
- **Gateway allow-list**: only known resource prefixes, `[A-Za-z0-9_-]` path segments, bounded body/query size; `/auth/login|refresh|logout` are never proxied.
- **Headers**: per-request nonce CSP with `strict-dynamic`, HSTS, `nosniff`, frame denial, `no-store` on pages. Pages are dynamic by design (a static page cannot carry a fresh nonce).
- **Files**: photos and voice notes are uploaded to the API itself (no S3, no links). `/api/captures/[id]/card|voice` streams the multipart body through without buffering or re-encoding (the access token is refreshed *before* forwarding because a streamed body can't be replayed), and `/api/attachments/[id]` streams files back with `Range` passthrough, which Safari needs to play audio. Only image/audio is ever served inline.
- **Permissions** come from `/auth/me`'s `permissions` array, never the role name. Nav, buttons and whole screens are gated by it, and 403s are handled everywhere.
- **Idempotency-Key**: one per logical submission (enquiry, touchpoint, each import chunk), reused on retry, fresh once the form changes.

## Design

Grounded in the `apple-design` skill (web app, so principles and foundations apply; Apple's platform conventions were translated, not copied):

- Semantic colour tokens for light and dark that follow the system (no in-app toggle). One accent, status colours only for meaning, always with a text label. Contrast is computed and recorded in `globals.css` (all text ≥ 4.5:1) and re-checked by axe in both schemes.
- System font on Apple devices (SF), Inter elsewhere. 44 px touch targets on phones, 36 px with a pointer; 16 px inputs so iOS never zooms; reduced motion, reduced transparency and increased contrast are respected; visible keyboard focus.
- Sidebar on desktop; a bottom tab bar (Home, Leads, Contacts, Follow-ups, More) on phones. Blur only on the floating tab bar, never on content.
- Signature element: the pipeline rail on a lead — where it sits from first contact to a closed deal, with *stale* and *lost* as side branches.
- Feedback lives in the interface; confirmations are reserved for irreversible actions (won, delete, revoke, sign out everywhere) with Cancel focused first.

## Decisions and gaps you should know about

1. **Capture at a show** is the booth screen from the API team's handoff: pick the show, **Take photo** (opens the rear camera on a phone) or **Choose a file**, tap the mic and talk, tap Done. Uploads show progress, and a failed upload keeps the photo and recording on screen so Retry is one tap and never creates a second capture. n8n reads the card and transcribes the note; **Captures** lists them (polling while any is being read) and the review screen pre-fills an editable form next to the original photo and recording, flags low-confidence fields, offers a choice when a phone holds two numbers, runs the duplicate check (attach to an open lead or start a new enquiry), and **Confirm** creates the lead. Confirm is never blocked by a slow or failed extraction. The lead's first message shows the photo and a playable recording.
   - **Take photo** opens the phone's own camera app on phones; on a laptop it opens an in-page camera with a live preview (browsers ignore `capture` on desktop). No camera, or permission refused, falls back to **Choose a file** with a clear message, and the camera is always switched off afterwards.
   - **Not from a show** (office visit, walk-in, meeting) is a real choice, sent as `event_id: null`; the lead is saved with source **In person**.
   - **Phones** are international (E.164). They show grouped (`+65 9123 4567`), Call links keep the country code, and numbers typed without a code are read as the organization's country (Settings → Organization → *Default country for phone numbers*).
1a. **Capture v2 (API migration 0007).** The review form is built from `suggestions.confirm_draft` (cleaned phone, country, export details, products, owner, follow-up, notes, duplicate recommendation), shows `suggestions.warnings`, and re-checks duplicates through `/captures/{id}/duplicates` as the reviewer edits — never by re-fetching the capture. The API's recommendation (add to an open enquiry / new enquiry) is pre-selected and can be overridden. `event_id` is sent only when the reviewer changed it; owner "Unassigned" sends `null`, blank leaves the API default (the rep who captured it). Confirm `router.replace`s to `redirect_lead_id`.
   - **Lead page** comes from one `/leads/{id}/context` call: contact/company details, export details (edited in place via `PATCH /leads/{id}`), products (`PUT /leads/{id}/products`), notes and promises, the show capture with transcript + translation, and the AI qualification panel. While research runs the page polls every 15 s. The AI score is always labelled a suggestion; the person's own rating stays theirs ("Use AI rating").
   - **Leads list** uses `/leads/overview` + `/leads/facets`. Every filter lives in the URL with the API's own keys, except `owner_id=me` (resolved to the viewer) and the date presets `created=today|7d|30d|custom` / `follow_up=overdue|today|7d|none|custom`, which are turned into local-midnight ISO ranges in the viewer's time zone at query time — so a shared "today" link means the reader's today. Logic: `src/lib/lead-filters.ts`.
   - **Booth screen** pre-selects a show from `/events/current` (a link's `?event=` wins, then a remembered show that is still on, then the API's suggestion). Exhibitions have Ongoing/Upcoming/Past tabs, a team, and a detail page (`/events/[id]`) with the performance summary.
   - **Mock API** (`e2e/mock-api`) implements all of this and rejects unknown body keys against `openapi.json`, like the real API, so e2e fails if the UI sends a field the API doesn't know. `POST /__research/{leadId}` is a mock-only hook to put research into a state.
   - **Tinted badges** are contrast-checked on white surfaces only; on the grey page background (headers) use plain coloured text (see `TimingBadge plain`).
1b. **Alternate number, WhatsApp default, first message, Save contact (API migration 0009).**
   - A card's second number becomes the contact's **Alternate number** (capture review, contact and enquiry forms, lead and contact pages). On the review screen **WhatsApp** is pre-filled with the main number and follows it until someone types a different one.
   - **First message** card on the lead page (`first-touch.tsx`): when a show capture is confirmed as a new lead (checkbox on the review screen, on by default), n8n's AI writes a personal WhatsApp message and email. The rep sees what it is personalised on and what to check, edits it, and either approves it (n8n sends it) or sends it from their own WhatsApp / email app (`wa.me` / `mailto:` with the text filled in, then a confirm that logs it as sent). *Write it again* takes guidance; *Discard*; failed and stuck sends have Retry. The page polls while it is written or sent. Settings → Organization → *First messages* switches on sending without review. The gateway lets through only the person-facing `/outreach/{id}` actions.
   - **Save contact** (`save-contact.tsx`, `src/lib/vcard.ts`) on the lead and contact pages. iPhone and computers get a vCard 3.0 file. On Android it tries an `intent:` link to Contacts' "new contact" screen. **That doesn't work:** Chrome only opens apps that accept browser links, and that screen doesn't, so the rep falls back to the offered `.vcf` download. To be fixed (see `STATUS_UI.md` §5).
   - Mock API: `POST /__outreach/{leadId}` puts a lead's first message into a state (plays the n8n writer in e2e).
2. **Message templates have no API**; they live in n8n. Follow-up rules store only the template ID, and the screen says so. (The first message to a new lead is written per lead by AI, not from a template.)
3. **Contact and company lists have no search.** The API only paginates them, so contact/company search scans the newest 200 and says so; "needs review" companies are found the same way. Leads (`/leads/overview?q=`) and products (`/products?q=`) do have server search now.
4. **No account merge endpoint**, so a flagged duplicate company shows a side-by-side comparison and explains the manual route.
5. `/leads/stats` is untyped in OpenAPI; the shape from the build guide is used (`src/lib/api/types.ts`).
6. **Rate limits are shared.** Behind this app every user of an organization shares the API's per-IP bucket unless the API is configured to trust this app's `X-Forwarded-For` (guide §2.2).
7. **One frontend instance is assumed** for the refresh lock. Before scaling out, swap the in-process `inflight` map in `src/lib/server/gateway.ts` for a Redis lock keyed by the same hash.
8. Verified only against the mock API (it implements the capture contract): real-phone camera/mic behaviour on iPhone Safari and Android Chrome, Safari audio seeking, and Sentry with a real DSN. (Since the Vercel deployment the team has used capture, the first message and Save contact on real phones; Save contact fails on Android as described in 1b.) The brief's definition-of-done checklist for those needs a real phone over HTTPS. Everything else runs in tests against the mock API, and `openapi.json` is refreshed from the live API.

## Deploy

**Today:** Vercel, building `main` on every push (environment: `API_URL`, `SESSION_SECRET`, `ENABLE_EXPERIMENTAL_COREPACK=1`). When an API change adds endpoints the app calls, deploy the API first, then the app.

**Self-hosted:** `docker-compose.example.yml` shows the container on the API's private network (`API_URL=http://api:8000`), read-only, all capabilities dropped. `docker build .` produces a standalone, non-root image with a `/api/health` healthcheck. Serve it over HTTPS (the session cookie is `Secure` in production; set `SESSION_COOKIE_SECURE=false` only to test a production build over plain http).

When the API changes: re-export `openapi.json`, run `pnpm gen:api && pnpm test`. The drift test names every field that moved.
