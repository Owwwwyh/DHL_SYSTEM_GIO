# DHL Knowledge Base System — Workflow Guide

A hands-on walkthrough of every flow in the system, with examples ready to copy-paste into your demo.

**Live URL:** `https://dhl-system-gio.vercel.app`
**Local dev:** `http://localhost:3000` (after `npm run dev`)

---

## 0. First-time setup

### Local
```bash
npm install
npm run db:push       # apply schema to your DB
npm run seed          # creates admin@dhl.com + editor@dhl.com
npm run dev
```

### Login credentials
- `admin@dhl.com` — full access (review queue, user management, admin tools)
- `editor@dhl.com` — can upload + edit own drafts only

Passwords come from `SEED_ADMIN_PASSWORD` / `SEED_EDITOR_PASSWORD` env vars. If those are unset on first seed, a random one is printed once to the terminal.

On first login, users with `mustChangePassword=true` are auto-redirected to `/change-password`.

---

## 1. Workflow A — Web user uploads a SOP

The "happy path" for a human submitting knowledge.

### Step 1.1 — Open `/upload`
Three input modes:
- **Paste text** — type or paste an SOP draft
- **Upload file** — `.pdf`, `.docx`, `.txt`, `.md`, or images (`.png` / `.jpg`)
- **Drag & drop** the file onto the panel

### Step 1.2 — Click "Process with AI"
What happens behind the scenes:
1. `POST /api/ingest` saves the raw input to the database
2. The file is hashed (MD5 + SHA) — if any file with the same hash was ingested in the last **14 days**, the request is rejected as a duplicate
3. `POST /api/process` is auto-triggered → calls Google Gemini
4. Gemini returns a structured `{ title, summary, steps[], tags[], relatedLinks[] }`
5. The system also passes any **published article titles + tags** to Gemini so it can flag conflicts (`hasConflict: true` + `conflictNote`)
6. An `Article` row is created with `status="draft"`

You'll see a "Draft Article Created" confirmation. Click **"View article"** to land on the editor.

### Step 1.3 — Edit the draft
On the article page:
- Edit title / summary / steps / tags / related links inline
- Click **"Save changes"** (calls `PUT /api/articles/[id]`)
- Click **"Submit for review"** — moves status from `draft` → `reviewed`

### Step 1.4 — Reviewer publishes
Login as `admin@dhl.com`. Open `/review`. You'll see all `reviewed` articles in a queue.
- Read the article
- Click **"Publish"** — moves status to `published` (visible to all editors via `/articles?status=published`)
- Or click **"Send back to draft"** — returns to author with a note

Every status change writes an `ArticleVersion` audit row (who, when, what changed, what note).

---

## 2. Workflow B — UiPath bot ingests files autonomously

The RPA path. The bot watches a folder / mailbox / Drive, then calls our REST API.

### Step 2.1 — Bot reads the API key
The bot reads `UIPATH_API_KEY` from a UiPath asset (or Orchestrator credential). Same value as the server's `UIPATH_API_KEY` env var.

### Step 2.2 — Duplicate check (skip-or-continue)
Before uploading, the bot calls:
```http
POST /api/duplicate-check
x-api-key: <your-key>
Content-Type: application/json

{ "fileHash": "<md5-of-file>" }
```
Response:
```json
{ "isDuplicate": true, "ingestedAt": "2026-04-21T08:14:00Z" }
```
If `true`, the bot logs "skip" and moves to the next file.

### Step 2.3 — Ingest the file
```http
POST /api/ingest
x-api-key: <your-key>
Content-Type: multipart/form-data

file=@parcel-scan-procedure.pdf
type=file
source=uipath
```
Response:
```json
{ "id": "cmop...", "status": "pending", "fileHash": "..." }
```
Capture the `id` for the next call.

### Step 2.4 — Trigger processing
```http
POST /api/process
x-api-key: <your-key>
Content-Type: application/json

{ "rawInputId": "cmop..." }
```
Response includes the generated article. Capture `articleId`.

### Step 2.5 — (Optional) Auto-promote
```http
POST /api/articles/{articleId}/status
x-api-key: <your-key>
Content-Type: application/json

{ "status": "reviewed", "note": "Auto-promoted by UiPath bot" }
```

### Step 2.6 — Daily summary email
At end-of-run:
```http
POST /api/summary-report
x-api-key: <your-key>
```
Sends a digest of the day's ingestions to `ADMIN_EMAIL`. Gracefully no-ops if SMTP isn't configured.

---

## 3. Browse, search, and filter articles

Open `/articles`:
- **Search bar** matches title, summary, AND tags (substring search via raw SQL)
- **Status filter** — Draft / Reviewed / Published / Archived
- **Tag filter** — click any tag from the cloud
- **Date range** — filter by `createdAt`
- **Pagination** — 20 per page (server-side)

### Print
Open any article → **"Print view"** button → opens `/articles/[id]/print` → browser print dialog auto-opens. The print stylesheet is DHL-branded, hides chrome.

---

## 4. Admin tasks

Login as `admin@dhl.com`. Open `/admin/users`.

### Create a new user
1. Click **"+ Add user"**
2. Fill name / email / role (`editor` / `reviewer` / `admin`) / temporary password
3. New users are created with `mustChangePassword=true` — they'll be forced to change on first login

### Disable / re-enable a user
Toggle the **Active** switch. Disabled users can't log in. (Soft-disable; no data is lost.)

### Edit user
Click the row → change name / role / password.

---

## 5. Useful API examples (cURL)

Replace `KEY` with your `UIPATH_API_KEY` value.

```bash
# 1. List all published articles
curl -H "x-api-key: KEY" \
  "https://dhl-system-gio.vercel.app/api/articles?status=published"

# 2. Get one article
curl -H "x-api-key: KEY" \
  "https://dhl-system-gio.vercel.app/api/articles/<id>"

# 3. Get system stats (KPI dashboard data)
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

## 6. Demo recipe (10–12 min video script)

A logical flow that hits every rubric point in order:

| Min | What you do | What you say |
|-----|-------------|--------------|
| 0:00–1:00 | Show login → dashboard | "DHL warehouse staff log in. The dashboard is the single pane showing what needs attention." |
| 1:00–2:30 | Upload text snippet → AI processing animation → draft article | "An editor pastes a procedure. Gemini extracts a structured SOP — title, summary, numbered steps, tags. Notice the conflict detector ran against published articles." |
| 2:30–3:30 | Edit the draft → submit for review | "The author tweaks step 3, then submits. Status moves draft → reviewed. Every edit is versioned." |
| 3:30–4:30 | Login as admin → `/review` → publish | "An admin reviews the queue, publishes one. The article is now live in the searchable KB." |
| 4:30–5:30 | `/articles` → search "scan" → tag-filter → open print view | "Search hits title, summary, and tags. Print view is DHL-branded for hard-copy SOPs." |
| 5:30–7:00 | Switch to UiPath Studio → run the bot against a folder → show 1 file processed, 1 duplicate skipped, 1 error caught | "The bot reads files from a folder, deduplicates, posts to the same REST API. Watch the dashboard counters tick up live." |
| 7:00–8:00 | Show UiPath workflow diagram — TRY/CATCH, retry-3x, screenshot-on-error | "Branching logic: duplicate-check decides skip or continue. Exception handler retries 3 times with backoff, then logs to errors.csv." |
| 8:00–9:00 | Open Vercel deployment + Neon DB live | "Deployed on Vercel, Postgres on Neon. JWT auth + per-key API auth on the same routes." |
| 9:00–10:00 | Admin → user CRUD → forced password change demo | "Full RBAC. New users must change password on first login." |
| 10:00–11:00 | Show GitHub commit history | "5+ meaningful commits — Postgres migration, hardening pass, forced password change, Vercel deploy fixes." |
| 11:00–12:00 | Wrap | "Architecture: Next.js 14 App Router, Prisma + Postgres, Gemini for AI, Vercel hosting, UiPath for ingestion." |

---

## 7. Troubleshooting cheatsheet

| Symptom | Cause | Fix |
|---|---|---|
| Login says "Invalid credentials" on Vercel | Stored password ≠ env var (user was created earlier) | Run a one-shot password reset against Neon, or delete + re-seed the user |
| "the URL must start with postgresql://" in Vercel build | Env var not linked or has stray characters | Settings → Environment Variables → re-link from Shared, or paste cleanly |
| "Failed to collect page data" + Prisma error | Vercel cached old `@prisma/client` | `build` script must be `prisma generate && next build` |
| Image upload returns a URL that 404s | Missing `BLOB_READ_WRITE_TOKEN` in production | Vercel → Storage → enable Blob (auto-populates the var) |
| Daily summary email never arrives | SMTP env vars empty | Wire Resend / SendGrid; populate `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` |
| UiPath bot gets 401 | API key mismatch | Bot's stored key must equal server's `UIPATH_API_KEY` value |
