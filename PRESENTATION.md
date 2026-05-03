# DHL Knowledge Base System — Presentation Summary

Mapped 1-to-1 against the marking rubric. Use the bullets verbatim as presenter notes.

---

## Section 1 — System & Application Implementation (8%)

### Web Application & API (50% of section 1)

#### Business Logic
- **Scenario:** Knowledge Base for DHL warehouse SOPs.
- **Workflow:** `Ingest → AI process → Draft → Review → Publish → Archive` with full version history at every transition.
- **Lifecycle state machine:** validated transitions (`draft ↔ reviewed ↔ published ↔ archived`) — invalid jumps return 400.
- **Conflict detection:** when Gemini processes a new article, it's given titles + tags of all published articles so it can flag overlaps (`hasConflict: true` + human-readable `conflictNote`).
- **Duplicate prevention:** any file ingested in the last 14 days (matched by MD5/SHA hash) is rejected before it hits the AI step — saves Gemini quota and prevents KB pollution.

#### User Interface
- **Tailwind + Next.js 14 App Router**, DHL red/yellow brand palette (`#D40511`, `#FFCC00`).
- **Dashboard:** 4-KPI summary, action banner that only appears when there's something to do (drafts to review, conflicts), single recent-activity feed. Designed for at-a-glance reading.
- **Upload:** drag-and-drop for files, paste-text for snippets, immediate visual feedback through 3 states (form → AI processing → result).
- **Article view:** inline editing, status pill, version history, print-to-PDF.
- **Review queue:** bulk select + bulk publish, with note field for "send back to draft".
- **Print view:** fully styled DHL-branded SOP document, prints cleanly to A4.
- **Forced first-login password change:** middleware redirects users with `mustChangePassword=true` to `/change-password` before they can use anything else.

#### JavaScript / TypeScript
- 100% TypeScript end-to-end (`tsc --noEmit` clean).
- React hooks for state (`useState`, `useEffect`, `useSession`).
- Async/await throughout API routes.
- Event handling: form submits, drag-and-drop, optimistic UI updates.
- Custom `useDebounce` for search; `useSession().update()` to refresh JWT in-place after password change.

#### CRUD & API (no hardcoded data)
Every page fetches dynamically via REST. No data is baked into components.

| Verb | Endpoint | Purpose |
|---|---|---|
| POST | `/api/ingest` | **Create** raw input (file/text) |
| POST | `/api/process` | **Create** Article from raw input via Gemini |
| GET | `/api/articles` | **Read** list (search/filter/paginate) |
| GET | `/api/articles/[id]` | **Read** single |
| PUT | `/api/articles/[id]` | **Update** title/summary/steps/tags |
| POST | `/api/articles/[id]/status` | **Update** lifecycle (with version row) |
| DELETE | `/api/articles/[id]` | **Delete** (soft — sets `deletedAt`) |
| GET/POST/PUT/DELETE | `/api/admin/users[/id]` | Full CRUD on users |
| POST | `/api/duplicate-check` | Hash-based dedup |
| GET | `/api/stats` | Dashboard KPIs |
| POST | `/api/summary-report` | Daily admin email |

Database: **Prisma + Postgres (Neon)**. Migrations versioned in `prisma/migrations/`.

### RPA Design (40% of section 1)

#### Workflow
- UiPath project at `uipath/Main.xaml`.
- **Inputs:** `BaseUrl`, `ApiKey`, `SourceType` (`googledrive` / `outlook` / `folder`), `SourcePath`, `AdminEmail`.
- **Branching logic:**
  - **Decision:** `isDuplicate` from `/api/duplicate-check` — true ⇒ skip + log, false ⇒ continue
  - **Decision:** processing success — true ⇒ optional auto-promote to `reviewed`, false ⇒ exception path
- **Exception path:** `TRY/CATCH` around each file. Catch block:
  1. Take screenshot to `logs/screenshots/<timestamp>.png`
  2. Log error with stack trace
  3. **Retry up to 3 times with exponential backoff**
  4. After exhaustion, append row to `logs/errors.csv`
- **End-of-run:** POST to `/api/summary-report` → admin email digest.

#### Automation Logic
- **Ingestion:** reads files from Drive / Outlook / folder via standard UiPath activities.
- **Duplicate check:** hash file → POST to `/api/duplicate-check` → skip if seen in last 14 days.
- **Updating the web app:** uses the same REST API as web users — single source of truth, no separate "robot endpoint".

#### Integration
**Bot ↔ Web App authentication:** every API route accepts **either** a NextAuth JWT session (browser users) **or** an `x-api-key` header matching the server's `UIPATH_API_KEY` env var (RPA bots). This is implemented in `src/lib/rbac.ts:requireRole()` and `src/lib/auth.ts`.

Why parallel auth: the bot can't store cookies / complete OAuth flows, but it needs the same data the web users see. One key, server-side rotation, no shared secrets in client code.

### GitHub Progress (10% of section 1)

#### Commit Frequency
≥5 meaningful commits across the development period (visible at `https://github.com/Owwwwyh/DHL_SYSTEM_GIO`):

| Commit | What it actually did |
|---|---|
| `Initial commit: DHL KB System MVP` | Scaffold + initial CRUD |
| `finalize dhl kb system features` | Article lifecycle + review queue + admin CRUD |
| `Add CLAUDE.md with codebase guidance` | Onboarding + arch docs |
| `Migrate to Postgres, refresh tooling, and apply P0–P2 hardening` | SQLite → Neon Postgres, rate-limiting, structured logging, soft-delete, body-size cap, seed-password rotation |
| `Force first-login password change; upgrade nodemailer to v7` | `mustChangePassword` flow + middleware redirect + JWT in-place refresh |
| `Run prisma generate in build script for Vercel deploys` | Vercel cache bug fix |
| `Wrap change-password page in Suspense to fix prerender` | Next 14 build error fix |

#### Commit Quality
Each message describes **what changed and why**, not "Update". The `Migrate to Postgres…` commit alone touched 53 files (~10k insertions) and the message itself is the changelog.

---

## Section 2 — Technical Report (4%)

### Architecture Diagram

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
        (Main.xaml)
        - Read files (Drive/Outlook/folder)
        - Hash + dedup check
        - POST /api/ingest → /api/process → /api/articles/{id}/status
        - TRY/CATCH + retry 3x + screenshot on error
        - POST /api/summary-report at end of run
```

### Technical Deep-Dive — API endpoints

Detailed in [doc.md](doc.md) sections 2 and 5. Every endpoint accepts either auth method, returns standard JSON, uses appropriate HTTP status codes (200/201/400/401/403/404/409/429/500).

JSON shape examples (see `src/app/(dashboard)/api-docs/page.tsx` for full table):

```jsonc
// POST /api/process response
{
  "id": "cmop...",
  "title": "Scan Parcel and Place on Conveyor",
  "summary": "This procedure outlines …",
  "steps": ["Step 1: Scan …", "Step 2: Place …"],
  "tags": ["scanning", "conveyor", "warehouse"],
  "relatedLinks": ["https://intranet.dhl/conveyor-safety"],
  "status": "draft",
  "hasConflict": false,
  "createdAt": "2026-05-03T08:14:00Z"
}
```

### User Manual
Provided in `doc.md` sections 0–4. Step-by-step from `npm install` to publishing the first article, suitable for someone who has never seen the system.

---

## Section 3 — Demo Video (3%)

### Full End-to-End Demo
Cover this exact flow (script in `doc.md` section 6):

1. UI walkthrough: login → dashboard → upload
2. AI processing in real time: paste text → Gemini → draft article appears
3. Edit + submit for review
4. Admin login → review queue → publish
5. Search/filter → open published article → print view
6. UiPath Studio: run the bot → bot processes 1 file, skips 1 duplicate, retries 1 error
7. Show the Vercel + Neon dashboards live, confirming database rows changed
8. Admin user CRUD + forced-password-change demo

### Clarity
- Show the **UiPath workflow diagram** before running the bot — explain branches and TRY/CATCH out loud
- Switch between browser, terminal, UiPath Studio in a deliberate order
- End with a 30-second "design choices" wrap: why Postgres over SQLite, why Gemini over OpenAI, why parallel auth on the same routes

---

## Honest disclosure (good to acknowledge if asked)

- **No SMTP yet** — daily summary email endpoint exists and is gated by env vars; will silently no-op without `SMTP_HOST`. Easy to wire (Resend free tier, single env var).
- **Soft-delete has no Trash UI** — restore is currently a manual SQL `UPDATE`. Field exists; UI deferred.
- **No MFA / no email verification** — out of scope for MVP. Forced password change covers most of the threat model.
- **Rate limiter is in-process** — fine for single-instance Vercel; would swap for Upstash Ratelimit on multi-region.

These are deliberate scope choices, not unknown gaps.
