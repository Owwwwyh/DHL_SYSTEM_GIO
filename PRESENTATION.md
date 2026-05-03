# DHL Knowledge Base System — Presentation Pack

> One document covering: presentation script (rubric-aligned), workflow walkthrough, API examples, demo recipe, troubleshooting.

**Live URL:** `https://dhl-system-gio.vercel.app`
**Repository:** `https://github.com/Owwwwyh/DHL_SYSTEM_GIO`

---

## Slide 1 — Project at a Glance

**Problem:** DHL warehouse SOPs live in scattered emails, chats, screenshots, PDFs. New staff can't find them; updates conflict; nothing is auditable.

**Solution:** Single web app + RPA bot that:
1. **Ingests** raw inputs from humans (web upload) and bots (UiPath)
2. **Processes** them with Google Gemini → structured SOP articles (title, summary, numbered steps, tags)
3. **Routes** them through a `Draft → Reviewed → Published → Archived` lifecycle with full version history
4. **Detects** duplicates (14-day hash window) and content conflicts automatically

**Result:** A single source-of-truth knowledge base that grows safely whether content arrives from a person or a robot.

---

## Slide 2 — Architecture Diagram

```
                    ┌─────────────────────┐
                    │  Vercel (Edge)      │
                    │  Next.js 14 App     │
                    │  ┌─────────────┐    │
   ┌─── Browser ───►│  │ React UI    │    │       ┌────────────────┐
   │  (NextAuth     │  └─────┬───────┘    │       │  Neon Postgres │
   │   JWT cookie)  │        │            │◄──────┤  - User        │
   │                │  ┌─────▼───────┐    │ Prisma│  - RawInput    │
   │                │  │ API Routes  │    │       │  - Article     │
   │                │  │ src/app/api │    │       │  - Article-    │
   │                │  └─────┬───────┘    │       │    Version     │
   │                │        │            │       └────────────────┘
   │                │  ┌─────▼───────┐    │
   │                │  │ lib/auth +  │    │       ┌────────────────┐
   │                │  │ lib/rbac    │    │       │  Vercel Blob   │
   │                │  └─────┬───────┘    │◄──────┤  (file uploads)│
   │                │        │            │       └────────────────┘
   │                │  ┌─────▼───────┐    │
   │                │  │ lib/gemini  │────┼──────►┌────────────────┐
   │                │  │ (AI extract │    │       │  Google Gemini │
   │                │  │  + conflict │    │       │  generative-ai │
   │                │  │  check)     │    │       └────────────────┘
   │                │  └─────────────┘    │
   │                └─────────────────────┘
   │                        ▲
   │                        │ x-api-key header
   │                        │
   └──── UiPath Bot ────────┘
        (uipath/Main.xaml)
        - Read files (Drive/Outlook/folder)
        - Hash + dedup check
        - POST /api/ingest → /api/process → /api/articles/{id}/status
        - TRY/CATCH + retry 3x + screenshot on error
        - POST /api/summary-report at end of run
```

**Key design choice:** the same REST API serves both web users and the RPA bot. One endpoint, two auth methods (JWT for browsers, `x-api-key` for bots). No duplicated business logic.

---

## Slide 3 — Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + API | **Next.js 14 (App Router)** | Single deploy, SSR + API routes co-located, built-in TypeScript |
| Language | **TypeScript** end-to-end | Catches contract drift between API and UI at compile time |
| Database | **Postgres on Neon** | Serverless, free tier, native arrays for `tags[]/steps[]/relatedLinks[]` |
| ORM | **Prisma 5** | Type-safe queries, migrations, single source of truth (`schema.prisma`) |
| Auth | **NextAuth + JWT + bcrypt** | Industry-standard credentials flow; JWT works on Vercel edge |
| Styling | **Tailwind CSS** | DHL brand palette, no design-system bloat |
| AI | **Google Gemini 1.5 Flash** | Generous free tier, strong JSON-mode output, image + text |
| File parsing | **pdf-parse**, **mammoth** | Server-side PDF and DOCX text extraction |
| File storage | **Vercel Blob** (prod) / local FS (dev) | Auto-fallback so dev still works without the token |
| Email | **nodemailer v7** | Daily summary digest (no-ops gracefully if SMTP unset) |
| Hosting | **Vercel** | Auto-deploy from `main`, env vars, edge runtime |
| RPA | **UiPath Studio** | Industry standard; project at `uipath/Main.xaml` |
| Tests | **Vitest** (unit) + **Playwright** (E2E) | Fast unit feedback + browser automation |
| CI | **GitHub Actions** with real Postgres + migrations + seed | Guards against environment drift |

---

## Slide 4 — Section 1A: Web Application & API (50% of section 1)

### Business Logic
- **Workflow:** Ingest → AI process → Draft → Review → Publish → Archive — full version history at every transition
- **State machine:** validated transitions only; invalid jumps return HTTP 400
- **Conflict detection:** Gemini compares each new draft against published article titles + tags, flagging overlaps with `hasConflict: true` + `conflictNote`
- **Duplicate prevention:** files hashed (MD5 + SHA); any hash seen in the last **14 days** is rejected before AI processing — saves quota and prevents pollution

### User Interface
- **Tailwind + Next.js 14 App Router**, DHL palette (`#D40511` red, `#FFCC00` yellow)
- **Dashboard:** 4 KPIs + smart action banner (only shows when there's something to do) + single recent-activity feed
- **Upload:** drag-and-drop OR paste-text; 3-state visual flow (form → processing → result)
- **Article view:** inline editing, status pill, version history, print-to-PDF
- **Review queue:** bulk select + bulk publish with note field for "send back to draft"
- **Print view:** DHL-branded SOP layout, prints cleanly to A4
- **Forced first-login password change:** middleware redirects users with `mustChangePassword=true` before they can use anything

### JavaScript / TypeScript
- 100% TypeScript end-to-end (`npx tsc --noEmit` is clean)
- React hooks: `useState`, `useEffect`, `useSession`, `useRouter`, `useSearchParams`
- Async/await throughout API routes; no callback hell
- Event handling: form submits, drag-and-drop, optimistic UI updates
- `useSession().update()` to refresh JWT in-place after password change (no re-login required)

### CRUD & API — no hardcoded data
Every page fetches dynamically via REST. **Nothing baked into components.**

| Verb | Endpoint | Operation |
|---|---|---|
| POST | `/api/ingest` | **C**reate raw input (file/text) |
| POST | `/api/process` | **C**reate Article from raw input via Gemini |
| GET | `/api/articles` | **R**ead list (search/filter/paginate) |
| GET | `/api/articles/[id]` | **R**ead single |
| PUT | `/api/articles/[id]` | **U**pdate title/summary/steps/tags |
| POST | `/api/articles/[id]/status` | **U**pdate lifecycle (writes audit row) |
| DELETE | `/api/articles/[id]` | **D**elete (soft — sets `deletedAt`) |
| GET/POST/PUT/DELETE | `/api/admin/users[/id]` | Full **CRUD** on users |
| POST | `/api/duplicate-check` | Hash-based deduplication |
| GET | `/api/stats` | Dashboard KPI data |
| POST | `/api/summary-report` | Daily admin email |

Database: **Prisma + Postgres (Neon)**. Migrations versioned in `prisma/migrations/`.

---

## Slide 5 — Section 1B: RPA Design (40% of section 1)

### Workflow (`uipath/Main.xaml`)

**Inputs:** `BaseUrl`, `ApiKey`, `SourceType` (`googledrive` / `outlook` / `folder`), `SourcePath`, `AdminEmail`

**Branching logic:**
- **Decision 1:** `isDuplicate` from `/api/duplicate-check` — `true` ⇒ skip + log, `false` ⇒ continue
- **Decision 2:** processing success — `true` ⇒ optional auto-promote to `reviewed`, `false` ⇒ exception path

**Exception path (TRY/CATCH around each file):**
1. Take screenshot to `logs/screenshots/<timestamp>.png`
2. Log error with stack trace
3. **Retry up to 3 times with exponential backoff**
4. After exhaustion, append row to `logs/errors.csv`

**End-of-run:** POST to `/api/summary-report` → admin email digest.

### Automation Logic
- **Ingestion:** reads files from Drive / Outlook / folder via standard UiPath activities
- **Duplicate check:** hash file → POST `/api/duplicate-check` → skip if seen in last 14 days
- **Updating the web app:** uses the same REST API as web users — single source of truth, no separate "robot endpoint"

### Integration
**Bot ↔ Web App auth:** every API route accepts **either** a NextAuth JWT session (browsers) **or** an `x-api-key` header matching `UIPATH_API_KEY` (RPA bots). Implemented in `src/lib/rbac.ts:requireRole()` and `src/lib/auth.ts`.

**Why parallel auth:** the bot can't store cookies / complete OAuth flows, but it needs the same data the web users see. One key, server-side rotation, no shared secrets in client code.

---

## Slide 6 — Section 1C: GitHub Progress (10% of section 1)

### Commit Frequency
≥7 meaningful commits across the development period at `https://github.com/Owwwwyh/DHL_SYSTEM_GIO`:

| Commit | What it actually did |
|---|---|
| `Initial commit: DHL KB System MVP` | Scaffold + initial CRUD |
| `finalize dhl kb system features` | Article lifecycle + review queue + admin CRUD |
| `Add CLAUDE.md with codebase guidance` | Onboarding + architecture docs |
| `Migrate to Postgres, refresh tooling, and apply P0–P2 hardening` | SQLite → Neon Postgres, rate-limiting, structured logging, soft-delete, body-size cap, seed-password rotation |
| `Force first-login password change; upgrade nodemailer to v7` | `mustChangePassword` flow + middleware redirect + JWT in-place refresh |
| `Run prisma generate in build script for Vercel deploys` | Vercel cache bug fix |
| `Wrap change-password page in Suspense to fix prerender` | Next 14 build error fix |
| `Simplify dashboard UI; add demo workflow + presentation docs` | UI polish + judge-facing docs |

### Commit Quality
Every message describes **what changed and why**, not "Update". The Postgres-migration commit alone touched 53 files / ~10k insertions and the message itself is the changelog.

---

## Slide 7 — Section 2: Technical Report (4%)

### Required deliverables (8–12 page report)
1. **Architecture diagram** — see Slide 2
2. **Technical deep-dive on API endpoints + JSON structures** — see Slide 8
3. **User manual (step-by-step)** — see Slide 9 onwards

### JSON shape examples

```jsonc
// POST /api/process response
{
  "id": "cmop...",
  "title": "Scan Parcel and Place on Conveyor",
  "summary": "This procedure outlines the essential steps …",
  "steps": ["Step 1: Scan parcel", "Step 2: Place on conveyor"],
  "tags": ["scanning", "conveyor", "warehouse"],
  "relatedLinks": ["https://intranet.dhl/conveyor-safety"],
  "status": "draft",
  "hasConflict": false,
  "createdAt": "2026-05-03T08:14:00Z"
}

// POST /api/duplicate-check response
{ "isDuplicate": true, "ingestedAt": "2026-04-21T08:14:00Z" }

// GET /api/stats response (dashboard)
{
  "articles": { "total": 12, "draft": 2, "reviewed": 1, "published": 8, "archived": 1, "conflicts": 0 },
  "inputs":   { "total": 14, "pending": 0, "done": 12, "failed": 2 },
  "recentFailures": [ ... ],
  "recentActivity": [ ... ]
}
```

Full reference is also rendered in-app at `/api-docs`.

---

## Slide 8 — Section 3: Demo Video Script (3%)

### 10–12 minute walkthrough — minute-by-minute

| Min | What you do on screen | What you say |
|---|---|---|
| 0:00–1:00 | Login → dashboard | "DHL warehouse staff log in. The dashboard is the single pane showing what needs attention — drafts, conflicts, failures." |
| 1:00–2:30 | Upload text snippet → AI processing animation → draft article | "An editor pastes a procedure. Gemini extracts a structured SOP — title, summary, numbered steps, tags. Notice the conflict detector ran against published articles." |
| 2:30–3:30 | Edit the draft → submit for review | "The author tweaks step 3, then submits. Status moves draft → reviewed. Every edit is versioned." |
| 3:30–4:30 | Login as admin → `/review` → publish | "An admin reviews the queue, publishes one. The article is now live in the searchable KB." |
| 4:30–5:30 | `/articles` → search "scan" → tag-filter → open print view | "Search hits title, summary, and tags. Print view is DHL-branded for hard-copy SOPs." |
| 5:30–7:00 | Switch to UiPath Studio → run the bot against a folder → 1 file processed, 1 duplicate skipped, 1 error caught | "The bot reads files from a folder, deduplicates, posts to the same REST API. Watch the dashboard counters tick up live." |
| 7:00–8:00 | Show UiPath workflow diagram — TRY/CATCH, retry-3x, screenshot-on-error | "Branching logic: duplicate-check decides skip or continue. Exception handler retries 3 times with backoff, then logs to errors.csv." |
| 8:00–9:00 | Open Vercel deployment + Neon DB live | "Deployed on Vercel, Postgres on Neon. JWT auth + per-key API auth on the same routes." |
| 9:00–10:00 | Admin → user CRUD → forced password change demo | "Full RBAC. New users must change password on first login." |
| 10:00–11:00 | Show GitHub commit history | "8 meaningful commits — Postgres migration, hardening pass, forced password change, Vercel deploy fixes, UI polish." |
| 11:00–12:00 | Wrap | "Architecture: Next.js 14, Prisma + Postgres, Gemini for AI, Vercel hosting, UiPath for ingestion. Same REST API for humans and robots." |

---

## Slide 9 — Workflow A: Web user uploads a SOP

### Step 1 — Open `/upload`
Three input modes: **paste text**, **upload file** (`.pdf` / `.docx` / `.txt` / `.md` / `.png` / `.jpg`), or **drag & drop**.

### Step 2 — Click "Process with AI"
Behind the scenes:
1. `POST /api/ingest` saves raw input to DB
2. File hashed (MD5 + SHA); 14-day duplicate check rejects repeat uploads
3. `POST /api/process` auto-triggered → calls Gemini
4. Gemini returns `{ title, summary, steps[], tags[], relatedLinks[] }`
5. System passes published article titles + tags so Gemini can flag conflicts
6. `Article` row created with `status="draft"`

### Step 3 — Edit the draft
Inline edit title / summary / steps / tags / related links → **Save changes** (`PUT /api/articles/[id]`) → **Submit for review** (status `draft` → `reviewed`).

### Step 4 — Reviewer publishes
Login as `admin@dhl.com` → `/review` → review queue → **Publish** (status `reviewed` → `published`) OR **Send back to draft** with note. Every transition writes an `ArticleVersion` audit row.

---

## Slide 10 — Workflow B: UiPath bot ingests files

### Step 1 — Bot reads API key from a UiPath asset
Same value as the server's `UIPATH_API_KEY` env var.

### Step 2 — Duplicate check
```http
POST /api/duplicate-check
x-api-key: <key>
Content-Type: application/json

{ "fileHash": "<md5-of-file>" }
```
Response: `{ "isDuplicate": true, "ingestedAt": "..." }` → bot logs "skip" and moves on.

### Step 3 — Ingest
```http
POST /api/ingest
x-api-key: <key>
Content-Type: multipart/form-data

file=@parcel-scan-procedure.pdf
type=file
source=uipath
```
Response: `{ "id": "cmop...", "status": "pending", "fileHash": "..." }`

### Step 4 — Process
```http
POST /api/process
x-api-key: <key>
Content-Type: application/json

{ "rawInputId": "cmop..." }
```

### Step 5 — (Optional) Auto-promote
```http
POST /api/articles/{id}/status
x-api-key: <key>
Content-Type: application/json

{ "status": "reviewed", "note": "Auto-promoted by UiPath bot" }
```

### Step 6 — Daily summary
```http
POST /api/summary-report
x-api-key: <key>
```
Sends digest to `ADMIN_EMAIL`. No-ops gracefully if SMTP isn't configured.

---

## Slide 11 — Browse, Search, Filter, Print

`/articles` page:
- **Search bar** — matches title, summary, AND tags (substring search via raw SQL)
- **Status filter** — Draft / Reviewed / Published / Archived
- **Tag filter** — click any tag from the cloud
- **Date range** — filter by `createdAt`
- **Pagination** — 20 per page (server-side)

**Print view:** click any article → "Print view" → opens `/articles/[id]/print` → browser print dialog auto-opens. DHL-branded layout, hides chrome.

---

## Slide 12 — Admin Tasks

Login as `admin@dhl.com` → `/admin/users`:

- **+ Add user** → name / email / role (`editor` / `reviewer` / `admin`) / temporary password. New users created with `mustChangePassword=true`.
- **Toggle Active** → soft-disable a user (no data lost; can't log in).
- **Edit user** → change name / role / password.

---

## Slide 13 — Live cURL Examples

Replace `KEY` with your `UIPATH_API_KEY` value.

```bash
# 1. List all published articles
curl -H "x-api-key: KEY" \
  "https://dhl-system-gio.vercel.app/api/articles?status=published"

# 2. Get one article
curl -H "x-api-key: KEY" \
  "https://dhl-system-gio.vercel.app/api/articles/<id>"

# 3. Get system stats (dashboard data)
curl -H "x-api-key: KEY" \
  "https://dhl-system-gio.vercel.app/api/stats"

# 4. Ingest a text snippet
curl -H "x-api-key: KEY" -H "Content-Type: application/json" \
  -d '{"type":"text","content":"Step 1: scan parcel. Step 2: place on conveyor."}' \
  "https://dhl-system-gio.vercel.app/api/ingest"

# 5. Check for duplicate before upload
curl -H "x-api-key: KEY" -H "Content-Type: application/json" \
  -d '{"fileHash":"d41d8cd98f00b204e9800998ecf8427e"}' \
  "https://dhl-system-gio.vercel.app/api/duplicate-check"
```

---

## Slide 14 — Troubleshooting Cheatsheet

| Symptom | Cause | Fix |
|---|---|---|
| Login says "Invalid credentials" on Vercel | Stored password ≠ env var (user was created earlier) | Run a one-shot password reset against Neon, or delete + re-seed the user |
| "the URL must start with postgresql://" in build | Env var not linked or has stray characters | Vercel → Environment Variables → re-link from Shared, or paste cleanly |
| "Failed to collect page data" + Prisma error | Vercel cached old `@prisma/client` | `build` script must be `prisma generate && next build` ✅ already fixed |
| Image upload returns a URL that 404s | Missing `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → enable Blob (auto-populates) ✅ already done |
| Daily summary email never arrives | SMTP env vars empty | Wire Resend / SendGrid; populate `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` |
| UiPath bot gets 401 | API key mismatch | Bot's stored key must equal server's `UIPATH_API_KEY` value |

---

## Slide 15 — Honest Disclosure (preempt the examiner)

These are **deliberate scope choices** for an MVP, not unknown gaps:

- **No SMTP yet** — daily summary endpoint exists; will silently no-op without `SMTP_HOST`. One env var to enable (Resend free tier).
- **Soft-delete has no Trash UI** — restore is a manual SQL `UPDATE` today. Field exists; UI deferred.
- **No MFA / no email verification** — out of MVP scope. Forced password change covers most of the threat model.
- **Rate limiter is in-process** — fine for single-instance Vercel; would swap for Upstash Ratelimit on multi-region.
- **Pre-existing transitive npm vulns** (12, mostly from `pdf-parse`) — would pin or replace in a follow-up audit.

---

## Slide 16 — Closing

**Demo-ready** ✅ — all P0 / P1 issues from `IssueDoc.md` are resolved or non-blocking.

**Deploy-ready** ✅ — live on Vercel + Neon Postgres, env vars configured, migrations applied.

**Open source** ✅ — full repo at `https://github.com/Owwwwyh/DHL_SYSTEM_GIO` with meaningful commit history.

**Single source of truth** for both human and robot ingestion paths — same API, same business logic, different auth.
