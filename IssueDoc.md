# IssueDoc — Open Issues Blocking / Risking Progress

Last updated **2026-05-03** after the in-code hardening pass on branch `claude/exciting-thompson-d64d18` (rate limiting, request-size cap, structured JSON logging, soft-delete for articles, seed-password rotation).

App boots, all checks green:
- `npm run lint` ✓ no warnings/errors
- `npx tsc --noEmit` ✓ clean
- `npm run test:run` (Vitest) ✓ 2/2 pass
- `npm run test:e2e` (Playwright) — pending re-run after applying the new migration

This file lists what is **not done** and **what could bite** before the demo or in production.

---

## P0 — Hard blockers (must fix before deploying to anyone)

### 1. Neon DB password is still in plain text in `.env`  *(unchanged — operational, not code)*
- The Gemini key has been rotated ✅ — that risk is gone.
- The Neon connection string in `F:\dhl-kb-system\.env` still contains `npg_0bIT…` in plaintext. `.env` is in `.gitignore` and was never committed (`git log --all --diff-filter=A -- .env` returns nothing), so this is **local-only exposure** today.
- **Action:** before any deployment (Vercel / Railway / similar), put `DATABASE_URL` in the platform's encrypted env-var store, not in a tracked file. Rotate the Neon password from the Neon console once the old value has been pasted into screenshots, slides, demo recordings, etc.

---

## P1 — Will surface during a hackathon demo

### 2. `npm install` requires `--legacy-peer-deps`  *(unchanged — needs next-auth v5 upgrade)*
- `next-auth@4.24.x` declares `nodemailer ^7` as `peerOptional` but only works with v6. `legacy-peer-deps=true` is persisted in `.npmrc` so installs work, but it also masks any **real** future peer-dep conflict.
- CI also passes `--legacy-peer-deps` to `npm ci`.
- **Action:** either upgrade to `next-auth` v5 (breaking, has its own migration guide) or pin `next-auth` to a version that doesn't list the bad peer.

### 3. UiPath workflow may have stale JSON.Parse on array fields  *(unchanged — needs UiPath Studio)*
- The on-the-wire JSON has always been arrays (only on-disk SQLite serialization changed), so the contract holds. But `uipath/Main.xaml` was written when those fields were stringified inside the DB — if any XAML step does `Deserialize JSON` on `tags` / `steps` / `relatedLinks` expecting a string, it will now error.
- **Action:** open `uipath/Main.xaml` in UiPath Studio, search for any `Deserialize JSON` step that touches `tags` / `steps` / `relatedLinks`, and confirm it expects a `JArray`, not a string.

---

## P2 — Production-readiness debt (won't block the demo, will block real use)

### ~~4. No password reset, no MFA, no email verification~~ **PARTIALLY FIXED**
- `scripts/seed.ts` no longer hardcodes `admin123` / `editor123`. Passwords now come from `$SEED_ADMIN_PASSWORD` / `$SEED_EDITOR_PASSWORD`, otherwise a random one is generated and printed once to stdout. Existing users are not touched on re-seed (idempotent).
- README + CLAUDE.md no longer publish the credentials. CI workflow pins them so Playwright login keeps working.
- **Still missing:** password reset flow, MFA, email verification. Forced first-login password change is also still unimplemented — anyone who runs the seed without env vars and notes the random password keeps it indefinitely.
- **Action (followup):** add a `mustChangePassword: Boolean` flag + a `/auth/change-password` page gated on first login.

### ~~5. No rate limiting on `/api/ingest`, `/api/process`, or `/api/duplicate-check`~~ **FIXED (in-process)**
- New `src/lib/rateLimit.ts` provides an in-memory token bucket keyed by `x-api-key` (when present) or client IP. Wired into all three endpoints:
  - `/api/ingest`         — capacity 30, refill 0.5/s
  - `/api/process`        — capacity 10, refill 0.2/s (tighter — LLM cost)
  - `/api/duplicate-check`— capacity 60, refill 1/s
  Returns 429 + `Retry-After` when exhausted; old buckets GC'd hourly.
- **Caveat:** the bucket lives in process memory, so on Vercel a multi-instance deployment will not share counters. Acceptable for the pilot; for real production swap to Upstash Ratelimit or similar (the call sites import a single `rateLimit()` function — swap is local to one file).

### ~~6. No request size limit on file uploads~~ **FIXED**
- `src/app/api/ingest/route.ts` now enforces a 4 MB ceiling via `Content-Length` and per-file `file.size` checks, returning 413 instead of letting the platform 500. Also exports `maxDuration = 60`.
- **Caveat:** this is a *hard limit at the server* — large files still need the `@vercel/blob/client` `upload()` browser-direct pattern. The current limit matches Vercel's serverless body cap (4.5 MB) so there's no surprise behavior.

### ~~7. No monitoring / structured logging~~ **PARTIALLY FIXED**
- New `src/lib/logger.ts` emits one-line JSON records (`{ts, level, scope, msg, ...}`) suitable for Vercel/BetterStack/Datadog log aggregators. Wired into:
  - `src/lib/gemini.ts` (text + image fallback paths)
  - `src/app/api/summary-report/route.ts` (SMTP missing + SMTP failure)
  - `src/app/api/ingest/route.ts` (parse errors + creation success)
  - `src/app/api/process/route.ts` (processing failures)
- **Still missing:** alerting. To wire Sentry / a webhook on errors, hook into `emit()` in `src/lib/logger.ts` — call sites stay unchanged.

### 8. No backup strategy for Neon  *(unchanged — operational)*
- Neon free tier has point-in-time restore for 7 days. Production needs longer retention + a tested restore drill.
- **Action:** schedule a `pg_dump` from a GitHub Action to S3/R2 nightly once you go live.

### ~~9. Article delete is hard delete, no soft-delete / undo~~ **FIXED**
- Added `deletedAt DateTime?` (with index) to `Article` in `prisma/schema.prisma`. New migration `20260503140000_add_article_deleted_at/migration.sql` adds the column + index in Postgres.
- `DELETE /api/articles/:id` now runs a transaction that sets `deletedAt` and writes an `ArticleVersion` row with `action: "deleted"` — full audit trail preserved, undo is a `deletedAt = null` UPDATE.
- All read paths filter `deletedAt: null`: `/api/articles` GET (incl. raw-SQL substring search), `/api/articles/:id` GET/PUT, `/api/articles/:id/status`, `/api/stats`, `/api/summary-report`, the print page, and the conflict-detection query in `/api/process`.
- **Action required before deploy:** apply the new migration (`npm run db:migrate:deploy`) — the column is required by the new code paths.

### 10. SMTP credentials are blank in `.env`  *(unchanged — operational)*
- The graceful fallback (P2-14) means the UiPath bot no longer crashes, but the summary email is still **never sent** — admins get nothing.
- **Action:** wire a real SMTP provider (Resend, SendGrid, Postmark) and populate `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`. Resend has a generous free tier and is one env var to set up.

### 11. Vercel Blob path requires `BLOB_READ_WRITE_TOKEN` in production  *(unchanged — operational)*
- Locally, the absence of the token triggers the local-FS fallback — fine for dev. In production (Vercel/Railway) without the token set, every image upload silently writes to the read-only/ephemeral container filesystem and the URL stored in `RawInput.filePath` will 404 on the next request.
- **Action:** `vercel link` your project, then `vercel env pull` (or set `BLOB_READ_WRITE_TOKEN` in the Vercel dashboard under your project's Storage → Blob). Verify the ingest path with a screenshot upload before the demo.

---

## P3 — Nice-to-haves spotted along the way

- The `useEffect(() => { load(); }, [])` pattern on 4 dashboard pages is suppressed with `// eslint-disable-next-line` because adding `load` to the dep array would cause infinite re-fetches. The clean fix is to move the fetch out of the component (server component / SWR / React Query) — moderate refactor.
- Prisma 5.22 → 7.x major version available; not urgent but worth a separate upgrade PR with full regression run.
- ESLint 8.57 is end-of-life. Migrate to ESLint 9 + flat config when `eslint-config-next` ships a v9-compatible release.
- Pre-existing 12 npm `audit` vulns (7 moderate, 4 high, 1 critical) — most are transitive from `pdf-parse`/`mammoth`. Audit and pin or replace.
- No `next.config.mjs` configuration for `images.domains` if you ever serve uploaded screenshots through `next/image` (Blob URLs need the Vercel Blob hostname allow-listed).
- `tests/e2e/article-lifecycle.spec.ts` calls real Gemini if `GEMINI_API_KEY` is set, otherwise the heuristic path. CI runs without the key (heuristic path) — that's deliberate and fine, but worth documenting if a future contributor wonders why CI never fails on Gemini quota.
- Rate limiter is in-process. For multi-instance deploys, swap to Upstash Ratelimit (single-file change in `src/lib/rateLimit.ts`).
- Logger is a thin JSON wrapper — wire to Sentry / BetterStack / a webhook by editing `emit()` in `src/lib/logger.ts`. No call-site changes needed.
- Soft-delete has no UI (no "Trash" view, no restore button). Restoring today requires a manual `UPDATE Article SET "deletedAt" = NULL WHERE id = ...`.

---

## What is genuinely working today

- Auth + RBAC (session + `x-api-key` parallel auth)
- Ingest → Process → Article pipeline with Gemini + heuristic fallback
- Article lifecycle state machine (draft → reviewed → published → archived) with version history + soft-delete
- Search/filter/pagination with substring tag search via raw SQL (excludes soft-deleted rows)
- Admin user CRUD
- Print view + daily summary report endpoint (graceful when SMTP is missing)
- UiPath workflow project + API contract documented in `/api-docs`
- File uploads route through Vercel Blob in prod, local FS in dev — with 4 MB body cap
- Per-key/IP rate limiting on the three RPA-facing endpoints
- Structured JSON logging on Gemini, summary-report, ingest, process error paths
- Vitest, Playwright (incl. lifecycle E2E), ESLint, Prettier, GitHub Actions CI with real Postgres + migrations + seed

The system is **demo-ready for the hackathon** and **deploy-ready for a small pilot** once P0-1 (move secrets to platform env store), P2-11 (set `BLOB_READ_WRITE_TOKEN` in Vercel), and the new `deletedAt` migration are applied. P1-2 (legacy-peer-deps) and P1-3 (UiPath XAML check) are good housekeeping before any real DHL ops use.
