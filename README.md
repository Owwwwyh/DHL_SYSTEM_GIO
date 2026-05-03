# DHL Knowledge Base System

> Production-style SOP / knowledge-base management platform for DHL warehouse operations. Same REST API serves both human users (browser) and RPA bots (UiPath). Live at **https://dhl-system-gio.vercel.app**.

[![Live on Vercel](https://img.shields.io/badge/live-vercel-black)](https://dhl-system-gio.vercel.app)
[![Postgres on Neon](https://img.shields.io/badge/db-neon%20postgres-blue)](https://neon.tech)
[![Next.js 14](https://img.shields.io/badge/next.js-14-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue)](https://www.typescriptlang.org)

---

## Table of Contents
1. [What this system does](#what-this-system-does)
2. [Why these technology choices](#why-these-technology-choices)
3. [Architecture](#architecture)
4. [Feature overview](#feature-overview)
5. [Data model](#data-model)
6. [REST API reference](#rest-api-reference)
7. [Authentication & authorization](#authentication--authorization)
8. [RPA integration (UiPath)](#rpa-integration-uipath)
9. [Local development setup](#local-development-setup)
10. [Production deployment](#production-deployment)
11. [Testing & quality](#testing--quality)
12. [Project structure](#project-structure)
13. [Security posture](#security-posture)
14. [Known scope choices](#known-scope-choices)
15. [Companion documents](#companion-documents)

---

## What this system does

**Problem.** DHL warehouse SOPs (standard operating procedures) live in scattered emails, chat threads, screenshots, PDFs, and one-off documents. New staff can't find them. Updates conflict with each other. Nothing is auditable. Knowledge ages and drifts.

**Solution.** A single application that:

1. **Ingests raw inputs** from two parallel paths:
   - **Web users** paste text or upload files via a clean drag-and-drop interface
   - **UiPath robots** sweep folders, mailboxes, or Google Drive and POST files via a REST API
2. **Processes** every input with **Google Gemini AI** to extract a structured SOP — title, summary, numbered steps, tags, related links — even from messy or partially-structured source material
3. **Detects duplicates** via file hashing (rejects anything seen in the last 14 days)
4. **Detects conflicts** by comparing each new draft against published article tags + titles, flagging overlap automatically
5. **Routes articles through a lifecycle** — `Draft → Reviewed → Published → Archived` — with full version history at every transition (who, when, what changed, what note)
6. **Provides a searchable, filterable, printable** knowledge base for the entire operation, with role-based access control and a forced-first-login password change for security

**Outcome:** a single source-of-truth knowledge base that grows safely whether content arrives from a person at a keyboard or a bot at 3 AM.

---

## Why these technology choices

Every choice is justified by what the project actually needs.

| Need | Choice | Reason |
|---|---|---|
| One process, frontend + API | **Next.js 14 (App Router)** | Single deploy unit, server components reduce client bundle, built-in TypeScript, excellent Vercel integration |
| Type safety end-to-end | **TypeScript (strict)** | Catches contract drift between API responses and UI consumers at compile time, not runtime |
| Persistent storage | **Postgres on Neon** | Serverless-friendly (autoscale-to-zero free tier), native array columns let `tags[]/steps[]/relatedLinks[]` live without JSON-string hackery, point-in-time recovery |
| Type-safe DB access | **Prisma 5** | Schema-first, generated types match runtime behavior, migration history versioned in git, single source of truth (`schema.prisma`) |
| Authentication | **NextAuth + JWT + bcrypt** | Industry-standard credentials provider, JWT works on Vercel edge runtime, bcrypt for password hashing |
| Styling | **Tailwind CSS** | Constraint-driven design system, DHL brand palette without bespoke CSS, no design-system bloat |
| AI extraction | **Google Gemini 1.5 Flash** | Strong JSON-mode output, generous free tier (60 RPM, 1M tokens/day), supports images + text, regional availability matches Asia-Pacific demo audience |
| Document parsing | **pdf-parse + mammoth** | Pure JS, no native binaries, work on Vercel functions out of the box |
| File storage | **Vercel Blob** (prod) / local FS (dev) | Auto-fallback so dev still works without a token; Blob is co-located with Vercel functions for low-latency reads |
| Email | **nodemailer v7** | Standard SMTP transport, works with any provider (Resend, SendGrid, Postmark) |
| Hosting | **Vercel** | Auto-deploy on git push, edge-cached static assets, env-var management UI, generous free tier for hackathons |
| RPA | **UiPath Studio** | Industry standard; project skeleton at `uipath/Main.xaml` with workflow diagram in XML comments |
| Tests | **Vitest** (unit) + **Playwright** (E2E) | Fast unit feedback (single-process, no JVM), real-browser E2E for lifecycle smoke tests |
| CI | **GitHub Actions** | Real Postgres service container per run + migrations + seed — guards against environment drift |

---

## Architecture

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

**Single REST API serves both humans and robots.** The same `/api/articles` route serves a browser session AND an `x-api-key`-authenticated bot. No duplicate business logic. Implemented in `src/lib/rbac.ts:requireRole()`.

---

## Feature overview

| Area | Implementation |
|---|---|
| **Authentication** | Email + password (bcrypt), JWT sessions via NextAuth, `x-api-key` header for RPA |
| **RBAC** | Hierarchical roles: `editor` < `reviewer` < `admin`; enforced in `src/lib/rbac.ts:requireRole()`; middleware redirects to `/login` and gates `/admin/*` |
| **Forced first login** | Users with `mustChangePassword=true` are auto-redirected to `/change-password`; JWT refreshes in-place via `useSession().update()` |
| **Upload console** | Text paste OR file upload (PDF, DOCX, TXT, MD, PNG, JPG); drag-and-drop; 4 MB body cap |
| **Duplicate guard** | MD5 + SHA file hash; rejects anything ingested in the last 14 days |
| **AI processing** | Gemini 1.5 Flash extracts `{title, summary, steps[], tags[], relatedLinks[]}`; heuristic fallback if `GEMINI_API_KEY` is unset |
| **Conflict detection** | Gemini receives published article titles + tags so it can flag overlaps (`hasConflict: true` + `conflictNote`) |
| **Article lifecycle** | State machine: `draft ↔ reviewed ↔ published ↔ archived`; invalid transitions return HTTP 400 |
| **Versioning** | `ArticleVersion` row appended on every create / edit / status change with author + note |
| **Soft delete** | Articles set `deletedAt` instead of hard-deleting; excluded from list queries via composite index |
| **Search & filter** | Substring match on title, summary, AND tags via raw SQL; status, tag, date range, creator filters; server-side pagination |
| **Print view** | `/articles/[id]/print` — DHL-branded SOP layout, browser print dialog auto-opens |
| **Stats dashboard** | 4 KPIs + smart action banner + recent activity feed; only shows alerts when there's something to do |
| **Admin user CRUD** | Full create / read / update / disable from `/admin/users` |
| **Daily summary email** | `POST /api/summary-report` digests the day's ingestions to `ADMIN_EMAIL`; no-ops gracefully if SMTP unset |
| **Rate limiting** | In-process token-bucket on `/api/ingest`, `/api/process`, `/api/duplicate-check` (429 + Retry-After) |
| **Structured logging** | One-line JSON via `src/lib/logger.ts` on Gemini, summary-report, ingest, process error paths — readable on Vercel Function Logs |

---

## Data model

```
User
 ├── id, email (unique), name, password (bcrypt), role, isActive,
 │   mustChangePassword, createdAt
 ├── 1:N RawInput        (uploads they submitted)
 ├── 1:N Article         (articles they own)
 └── 1:N ArticleVersion  (audit author)

RawInput
 ├── id, type, content, filePath, fileHash, status, errorMsg,
 │   source (web | uipath), createdAt, updatedAt
 └── 1:1 Article         (after AI processing)

Article
 ├── id, title, summary, steps[], tags[], relatedLinks[], sourceType,
 │   status, hasConflict, conflictNote, createdAt, updatedAt, deletedAt
 ├── N:1 RawInput        (origin)
 └── 1:N ArticleVersion  (history)

ArticleVersion
 └── id, articleId, status, title, summary, steps[], tags[],
     action (created | edited | status_changed), note, userId, createdAt
```

Schema lives at [`prisma/schema.prisma`](./prisma/schema.prisma). Migrations are in [`prisma/migrations/`](./prisma/migrations/).

---

## REST API reference

The full interactive reference is rendered in-app at **`/api-docs`** (login first). Highlights:

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/duplicate-check` | x-api-key OR session | Pre-ingest hash check |
| POST | `/api/ingest` | x-api-key OR session | multipart or JSON, 4 MB cap |
| POST | `/api/process` | x-api-key OR session | Triggers Gemini + creates Article |
| GET | `/api/articles` | x-api-key OR session | `q`, `status`, `tag`, `from`, `to`, `creator`, `page` |
| POST | `/api/articles` | session | Manual create (rare) |
| GET | `/api/articles/:id` | session | Includes user |
| PUT | `/api/articles/:id` | session | Logs an edit version |
| DELETE | `/api/articles/:id` | session (reviewer+) | Soft delete |
| POST | `/api/articles/:id/status` | x-api-key OR session | Validates state machine |
| GET | `/api/articles/:id/versions` | session | Audit trail |
| GET | `/api/stats` | x-api-key OR session | Dashboard widgets |
| GET | `/api/summary-report` | x-api-key OR session | Stats since `?since=` |
| POST | `/api/summary-report` | x-api-key OR session | Sends digest email |
| GET / POST / PUT / DELETE | `/api/admin/users[/:id]` | session (admin) | Full CRUD |
| POST | `/api/auth/change-password` | session | Validates current pw, clears `mustChangePassword` |

### Example response shapes

```jsonc
// POST /api/process (the canonical Article shape)
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

// POST /api/duplicate-check
{ "isDuplicate": true, "ingestedAt": "2026-04-21T08:14:00Z" }

// GET /api/stats (powers the dashboard)
{
  "articles": { "total": 12, "draft": 2, "reviewed": 1, "published": 8, "archived": 1, "conflicts": 0 },
  "inputs":   { "total": 14, "pending": 0, "done": 12, "failed": 2 },
  "recentFailures": [ … ],
  "recentActivity": [ … ]
}
```

---

## Authentication & authorization

**Two parallel auth modes coexist on every API route that mutates or reads article data:**

1. **NextAuth JWT session** (browser users) — `getServerSession(authOptions)` from `src/lib/auth.ts`
2. **`x-api-key` header** matching `process.env.UIPATH_API_KEY` (RPA / scripts)

Routes that mutate article data accept either. Pure UI routes only accept the session. Admin routes require session + `admin` role.

**RBAC** is hierarchical (`editor` < `reviewer` < `admin`) and enforced via `requireRole(minRole)` in `src/lib/rbac.ts`. `middleware.ts` additionally redirects unauthenticated users to `/login`, gates `/admin/*` to admins, and redirects users with `mustChangePassword=true` to `/change-password?forced=1`.

```http
# Browser
Cookie: next-auth.session-token=…

# RPA bot
x-api-key: <UIPATH_API_KEY>
```

---

## RPA integration (UiPath)

Project at [`uipath/`](./uipath/). The workflow ([`uipath/Main.xaml`](./uipath/Main.xaml)) implements:

**Inputs:** `BaseUrl`, `ApiKey`, `SourceType` (`googledrive` / `outlook` / `folder`), `SourcePath`, `AdminEmail`

**Branching logic:**
- **Decision 1:** `isDuplicate` from `/api/duplicate-check` — true ⇒ skip + log, false ⇒ continue
- **Decision 2:** processing success — true ⇒ optional auto-promote to `reviewed`, false ⇒ exception path

**Exception path (TRY/CATCH around each file):**
1. Take screenshot to `logs/screenshots/<timestamp>.png`
2. Log error with stack trace
3. Retry up to 3 times with exponential backoff
4. After exhaustion, append row to `logs/errors.csv`

**End-of-run:** POST to `/api/summary-report` → admin email digest.

**Why parallel auth:** the bot can't store cookies / complete OAuth flows, but it needs the same data the web users see. One key, server-side rotation, no shared secrets in client code.

---

## Local development setup

### Prerequisites
- Node.js 18+
- A Postgres database (Neon free tier works, or local Docker `postgres:16`)
- Optional: Google Gemini API key (free at [aistudio.google.com](https://aistudio.google.com)); without it, a heuristic fallback still produces valid articles

### Steps

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.local.example .env.local
# Edit .env.local with at minimum:
#   DATABASE_URL="postgresql://user:pw@host:5432/db"
#   NEXTAUTH_SECRET="<generate with: openssl rand -base64 32>"
#   NEXTAUTH_URL="http://localhost:3000"
#   UIPATH_API_KEY="<any string; UiPath will send it as x-api-key>"
#   GEMINI_API_KEY="<optional>"

# 3. Apply schema
npx prisma migrate deploy   # or: npm run db:push for a quick first-time push

# 4. Seed starter accounts
#    Set SEED_ADMIN_PASSWORD / SEED_EDITOR_PASSWORD first to control passwords;
#    otherwise random ones print to stdout exactly once.
npm run seed

# 5. Run
npm run dev
# → http://localhost:3000
```

### npm scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server on http://localhost:3000 |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run start` | Start the production server |
| `npm run db:push` | Apply Prisma schema directly (dev) |
| `npm run db:migrate` | Create + apply a new dev migration |
| `npm run db:migrate:deploy` | Apply pending migrations (production / CI) |
| `npm run db:studio` | Open Prisma Studio at http://localhost:5555 |
| `npm run seed` | Provision `admin@dhl.com` and `editor@dhl.com` |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run test` / `test:run` | Vitest (watch / single-shot) |
| `npm run test:e2e` | Playwright E2E |

---

## Production deployment

Hosted on **Vercel** with a **Neon Postgres** database. Auto-deploys from `main` on every push.

### Required environment variables (Vercel → Settings → Environment Variables)

| Variable | Required? | What it does |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string (Neon URL) |
| `NEXTAUTH_SECRET` | ✅ | JWT signing secret; rotate to invalidate all sessions |
| `NEXTAUTH_URL` | ✅ | Your live URL (e.g. `https://dhl-system-gio.vercel.app`) |
| `UIPATH_API_KEY` | ✅ | Shared secret for RPA bot auth |
| `BLOB_READ_WRITE_TOKEN` | ✅ for prod | Vercel Blob token for file uploads (auto-set when you enable Blob storage) |
| `SEED_ADMIN_PASSWORD` | optional | Controls `admin@dhl.com` password on seed; random if unset |
| `SEED_EDITOR_PASSWORD` | optional | Controls `editor@dhl.com` password on seed; random if unset |
| `GEMINI_API_KEY` | optional | Enables real LLM extraction; heuristic fallback if unset |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | optional | Daily summary email; gracefully no-ops if any are missing |
| `ADMIN_EMAIL` | optional | Recipient of daily summary |

### Deploy steps for a fresh project
1. Push code to GitHub
2. Import repo into Vercel
3. Add env vars (use Shared Variables at the team level + link them into the project)
4. Apply migrations against your prod DB: `npx prisma migrate deploy` (locally pointing at the prod `DATABASE_URL`)
5. Run seed once: `npm run seed` (with prod `DATABASE_URL` exported)
6. Trigger first deploy

### Build script note
`"build": "prisma generate && next build"` — the explicit `prisma generate` is required because Vercel caches `node_modules`, which skips Prisma's `postinstall`. Without this prefix the build fails with "outdated Prisma Client".

---

## Testing & quality

| Layer | Tool | Status |
|---|---|---|
| TypeScript | `tsc --noEmit` | ✅ clean |
| Lint | ESLint via `next lint` | ✅ no warnings/errors |
| Unit | Vitest | ✅ 2/2 pass (Gemini fallback logic) |
| E2E | Playwright | Login + full article lifecycle covered (`tests/e2e/`) |
| CI | GitHub Actions | Runs lint + tsc + Vitest + Playwright against a real Postgres service container per push |

CI workflow at [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

---

## Project structure

```
.
├── prisma/
│   ├── schema.prisma          # data model (Postgres)
│   └── migrations/            # versioned migration history
├── public/                    # static assets, uploads (dev)
├── src/
│   ├── app/
│   │   ├── (auth)/            # public: login, change-password
│   │   ├── (dashboard)/       # gated: dashboard, upload, articles, review, admin, profile, api-docs
│   │   └── api/               # REST endpoints (one folder per route)
│   ├── components/            # shared React components (StatusBadge, etc.)
│   └── lib/
│       ├── auth.ts            # NextAuth config + JWT callbacks
│       ├── rbac.ts            # requireRole() — the auth + role check
│       ├── prisma.ts          # singleton PrismaClient
│       ├── gemini.ts          # AI extraction + heuristic fallback
│       ├── fileParser.ts      # PDF/DOCX/text extraction + hashing
│       ├── rateLimit.ts       # in-process token-bucket
│       └── logger.ts          # structured JSON logging
├── tests/
│   ├── e2e/                   # Playwright
│   └── unit/                  # Vitest
├── uipath/
│   ├── Main.xaml              # workflow with TRY/CATCH + retries
│   ├── README.md              # API contract for the bot
│   └── project.json
├── scripts/
│   └── seed.ts                # idempotent admin/editor seed
├── middleware.ts              # auth gate + role gate + change-password redirect
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── vitest.config.ts
├── playwright.config.ts
├── .github/workflows/ci.yml
├── README.md                  # ← you are here
├── PRESENTATION.md            # rubric-aligned presentation pack
├── IssueDoc.md                # known issues + scope choices
└── CLAUDE.md                  # codebase guide for AI assistants
```

---

## Security posture

| Concern | Mitigation |
|---|---|
| Password storage | bcrypt with cost 10; never logged |
| Session theft | JWT in httpOnly cookie; `NEXTAUTH_SECRET` rotation invalidates all sessions |
| RPA key leak | Single env var; rotate without code change; key never sent to client |
| Brute force on auth | In-process rate limiter on auth-adjacent endpoints |
| Forced first login | `mustChangePassword` flag + middleware redirect; cleared via `/api/auth/change-password` |
| Soft delete | Articles get `deletedAt` set instead of hard delete; restore is reversible |
| Body size DoS | 4 MB cap on `/api/ingest` |
| Duplicate flooding | 14-day hash window rejects re-uploads before they hit the AI |
| SQL injection | Prisma parameterizes all queries; the one raw query (tag substring search) uses parameterized `$queryRaw` |
| XSS | React auto-escapes; no `dangerouslySetInnerHTML` except for the print page's `window.print()` |
| Secrets in repo | `.env*` is gitignored; Neon connection string lives only in Vercel's encrypted env var store + local `.env` |

---

## Known scope choices

These are deliberate, not unknown gaps:

- **No SMTP yet** — daily summary endpoint exists; will silently no-op without `SMTP_HOST`. One env var to enable (Resend free tier).
- **Soft-delete has no Trash UI** — restore is a manual SQL `UPDATE` today. Field exists; UI deferred.
- **No MFA / no email verification** — out of MVP scope. Forced password change covers most of the threat model.
- **Rate limiter is in-process** — fine for single-instance Vercel; would swap for Upstash Ratelimit on multi-region.
- **Pre-existing transitive npm vulns** (mostly `pdf-parse` chain) — would pin or replace in a follow-up audit.
- **No alerting on top of structured logs** — would wire Sentry / BetterStack on the `error` channel before serious production use.

Tracked in [`IssueDoc.md`](./IssueDoc.md).

---

## Companion documents

| File | Purpose |
|---|---|
| [`PRESENTATION.md`](./PRESENTATION.md) | Rubric-aligned presentation pack (slide-ready), workflow walkthrough, demo script, troubleshooting |
| [`IssueDoc.md`](./IssueDoc.md) | Known issues + production-readiness debt + honest scope choices |
| [`CLAUDE.md`](./CLAUDE.md) | Codebase guide for AI assistants (architecture, conventions, gotchas) |
| [`uipath/README.md`](./uipath/README.md) | UiPath project overview + API contract |

---

## License

MIT — see commits for full author history.

---

**Built for the DHL Hackathon. Live at https://dhl-system-gio.vercel.app**
