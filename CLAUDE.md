# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

```bash
npm run dev            # Next.js dev server on http://localhost:3000
npm run build          # Production build
npm run start          # Start production server
npm run db:push        # Apply prisma/schema.prisma to prisma/dev.db (no migrations folder — db push only)
npm run db:studio      # Prisma Studio at http://localhost:5555
npm run seed           # Recreate admin@dhl.com / editor@dhl.com starter accounts
```

There is no test runner, linter, or formatter configured. Type-check via `npx tsc --noEmit`.

After editing `prisma/schema.prisma`, always run `npm run db:push` then re-run `npm run seed` if the data was wiped.

## Required environment

`.env.local` (template in `.env.local.example`) must define:
`DATABASE_URL` (defaults to `file:./dev.db`), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `UIPATH_API_KEY`, and optionally `GEMINI_API_KEY`. Without `GEMINI_API_KEY` the app still works — `src/lib/gemini.ts` falls back to a heuristic processor that mimics the LLM's output shape.

## Architecture

Single Next.js 14 App Router process serves both the UI and the REST API. There is no separate backend.

**Route groups** (`src/app/`):
- `(auth)/login` — public login page
- `(dashboard)/*` — all authenticated UI (upload, articles, review, admin, profile, api-docs)
- `api/*` — REST endpoints; the same handler often serves browser sessions and UiPath robots

**Two parallel auth modes** on most API routes:
1. NextAuth JWT session (browser users) — `getServerSession(authOptions)` from `src/lib/auth.ts`
2. `x-api-key` header matching `process.env.UIPATH_API_KEY` (RPA/scripts)

Routes that mutate or read article data accept either. Pure UI routes only accept the session. See `src/app/api/ingest/route.ts` for the canonical pattern. Admin routes require session + `admin` role.

**RBAC** is hierarchical (`editor` < `reviewer` < `admin`) and enforced via `requireRole(minRole)` in `src/lib/rbac.ts`. `middleware.ts` additionally redirects unauthenticated users to `/login` and gates `/admin/*` to admins; update its `matcher` array when adding new top-level protected routes.

**Ingest → Process → Article pipeline**:
1. `POST /api/ingest` writes a `RawInput` row (text/file/image/etc). Files are saved under `public/uploads/` and hashed (MD5/SHA via `src/lib/fileParser.ts`). Duplicate detection rejects any hash already ingested in the **last 14 days** — see `FOURTEEN_DAYS_MS` in the ingest route.
2. `POST /api/process` (or auto-trigger after ingest) calls `src/lib/gemini.ts` to produce `{title, summary, steps[], tags[], relatedLinks[]}`. Gemini may also be passed published-article context to set `hasConflict` + `conflictNote`.
3. The resulting `Article` is linked 1:1 to its `RawInput`.

**Article lifecycle state machine** (`draft → reviewed → published → archived`, with reverse transitions allowed). State transitions go through `POST /api/articles/[id]/status` which validates the move and writes an `ArticleVersion` audit row. Every create/edit/status-change appends an `ArticleVersion`.

**Prisma + SQLite quirk**: SQLite has no native arrays, so `Article.steps`, `Article.tags`, and `Article.relatedLinks` are stored as **JSON-encoded strings**. Always `JSON.parse` on read and `JSON.stringify` on write — the schema field types are `String`, not arrays. Same applies to the corresponding fields on `ArticleVersion`.

**Prisma client** is a global singleton (`src/lib/prisma.ts`) to survive Next.js dev hot reloads.

## UiPath integration

The `uipath/` directory holds a UiPath Studio project that hits this same API using `x-api-key`. When changing API contracts (request/response shape, status codes, auth header) on `/api/duplicate-check`, `/api/ingest`, `/api/process`, `/api/articles*`, `/api/stats`, or `/api/summary-report`, also check `uipath/README.md` and the workflow XAML for assumptions that may need updating.

## Default credentials (dev only)

`admin@dhl.com / admin123` and `editor@dhl.com / editor123`, created by `npm run seed`.
