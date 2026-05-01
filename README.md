# DHL Knowledge Base System

End-to-end SOP/Knowledge-Base management platform for DHL Logistics Operations.
Raw messy inputs (emails, chat threads, screenshots, notes, PDFs, Word docs)
are ingested manually through the web app or automatically via UiPath RPA,
processed by Gemini AI into structured articles, and then routed through a
Draft → Reviewed → Published lifecycle.

## Architecture

```
┌──────────────────┐     ┌──────────────────────────────┐     ┌──────────────┐
│  Web users       │     │  Next.js 14 (App Router)     │     │  SQLite      │
│  (browser)       │◄───►│  + NextAuth (JWT sessions)   │◄───►│  via Prisma  │
└──────────────────┘     │  + REST API routes           │     └──────────────┘
                         │  + Tailwind UI               │
┌──────────────────┐     │                              │     ┌──────────────┐
│  UiPath robot    │────►│  /api/ingest                 │────►│  Gemini API  │
│  (x-api-key)     │     │  /api/process                │     │  (optional;  │
│                  │     │  /api/articles  CRUD         │     │   heuristic  │
│                  │◄────│  /api/summary-report (email) │     │   fallback)  │
└──────────────────┘     └──────────────────────────────┘     └──────────────┘
```

## Stack

* **Next.js 14** App Router (frontend + API routes in one process)
* **Prisma + SQLite** (no external DB setup, file lives at `prisma/dev.db`)
* **NextAuth** with credentials provider, JWT session strategy
* **Tailwind CSS** for the UI
* **Google Gemini 1.5 Flash** for text + image AI (graceful heuristic fallback if no key)
* **pdf-parse** + **mammoth** for PDF / DOCX text extraction
* **nodemailer** for the daily admin summary email
* **UiPath Studio** project under [`uipath/`](./uipath/)

## Quick start (local)

```bash
# 1. Install deps
npm install

# 2. Provision a .env.local (already created in this repo; copy from .env.local.example if missing)
#    DATABASE_URL="file:./dev.db"
#    NEXTAUTH_SECRET="<random>"
#    NEXTAUTH_URL="http://localhost:3000"
#    GEMINI_API_KEY="<optional, free at aistudio.google.com>"
#    UIPATH_API_KEY="<any string; UiPath sends it in x-api-key>"

# 3. Create / migrate the SQLite database
npx prisma db push

# 4. Seed the two starter accounts
npm run seed
#    admin@dhl.com  / admin123
#    editor@dhl.com / editor123

# 5. Run dev server
npm run dev
# open http://localhost:3000
```

## Application features

| Area              | What's implemented                                                                |
|-------------------|------------------------------------------------------------------------------------|
| Auth              | Email/password login, hashed with bcrypt, JWT sessions, role-based access control |
| Roles             | `editor` < `reviewer` < `admin` (admin manages users, reviewer can delete)         |
| Upload Console    | text / PDF / DOCX / images / chat / email / training material                      |
| Duplicate guard   | MD5/SHA hash lookup, skips if same content was ingested in the last 14 days        |
| AI processing     | Gemini extracts title, summary, steps, tags, related links — JSON only             |
| Conflict flag     | LLM compares draft against published articles with overlapping tags                |
| Lifecycle         | Draft → Reviewed → Published → Archived (with reverse transitions allowed)         |
| Versioning        | `ArticleVersion` row per create/edit/status-change with author + note              |
| Search & filter   | full-text on title/summary/tags + status + tag + date range + creator              |
| Pagination        | Server-side, 20 per page (configurable up to 50)                                   |
| Print view        | `/articles/[id]/print` — clean, printable SOP layout                                |
| Stats dashboard   | live article + ingestion counts, recent activity, recent failures                  |
| Admin panel       | user CRUD + role/active-flag management                                            |
| Daily summary     | `POST /api/summary-report` triggers SMTP email with totals + error list            |

## REST API

The full reference is rendered inside the app at **`/api-docs`** (login first).
Highlights:

| Method | Path                              | Auth                | Notes                            |
|--------|-----------------------------------|---------------------|----------------------------------|
| POST   | `/api/duplicate-check`            | none (public)       | Pre-ingest hash check            |
| POST   | `/api/ingest`                     | x-api-key OR session| multipart or JSON                 |
| POST   | `/api/process`                    | x-api-key OR session| Triggers Gemini processing       |
| GET    | `/api/articles`                   | x-api-key OR session| q/status/tag/from/to/creator/page|
| POST   | `/api/articles`                   | session             | Manual create                    |
| GET    | `/api/articles/:id`               | session             | Includes user                    |
| PUT    | `/api/articles/:id`               | session             | Logs an edit version             |
| DELETE | `/api/articles/:id`               | session (reviewer+) | RBAC enforced                    |
| POST   | `/api/articles/:id/status`        | x-api-key OR session| Validates state machine          |
| GET    | `/api/articles/:id/versions`      | session             | Audit trail                      |
| GET    | `/api/stats`                      | x-api-key OR session| Dashboard widgets                |
| GET    | `/api/summary-report`             | x-api-key OR session| Stats since `?since=`            |
| POST   | `/api/summary-report`             | x-api-key OR session| Sends digest email               |
| GET    | `/api/admin/users`                | session (admin)     |                                  |
| POST   | `/api/admin/users`                | session (admin)     |                                  |
| PUT    | `/api/admin/users/:id`            | session (admin)     |                                  |
| DELETE | `/api/admin/users/:id`            | session (admin)     |                                  |

### Authentication for UiPath / scripts

Send the API key in a header:

```http
x-api-key: <UIPATH_API_KEY value>
```

## RPA (UiPath)

See [`uipath/README.md`](./uipath/README.md) for the full workflow diagram,
input arguments, and HTTP request samples. The project implements:

* Source enumeration (Google Drive / Outlook / folder)
* `POST /api/duplicate-check` skip logic
* Try/Catch with screenshot-on-failure and retry scope
* Log files (`logs/run-*.txt`, `logs/errors.csv`)
* Daily summary email via `POST /api/summary-report`

## Data model (Prisma)

```
User
 ├── id, email (unique), name, password, role, isActive, createdAt
 ├── 1:N RawInput      (uploads they submitted)
 ├── 1:N Article       (articles they own)
 └── 1:N ArticleVersion(audit author)

RawInput
 ├── id, type, content, filePath, fileHash, status, errorMsg, source(web|uipath)
 └── 1:1 Article (after processing)

Article
 ├── id, title, summary, steps[], tags[], relatedLinks[], sourceType, status,
 │   hasConflict, conflictNote, createdAt, updatedAt
 ├── N:1 RawInput  (origin)
 └── 1:N ArticleVersion (history)

ArticleVersion
 └── id, articleId, status, title, summary, steps, tags, action, note, userId, createdAt
```

## Scripts

| Command           | Purpose                                               |
|-------------------|-------------------------------------------------------|
| `npm run dev`     | Next.js dev server on http://localhost:3000          |
| `npm run build`   | Production build                                      |
| `npm run start`   | Start the production server                           |
| `npm run db:push` | Apply Prisma schema to `prisma/dev.db`                |
| `npm run db:studio` | Open Prisma Studio at http://localhost:5555         |
| `npm run seed`    | Insert default `admin@dhl.com` and `editor@dhl.com`   |

## Default credentials

| Role   | Email             | Password   |
|--------|-------------------|------------|
| admin  | admin@dhl.com     | admin123   |
| editor | editor@dhl.com    | editor123  |

> Change these immediately in production via the Admin panel or `scripts/seed.ts`.
