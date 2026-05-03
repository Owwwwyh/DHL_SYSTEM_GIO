# IssueDoc — Open Issues Blocking / Risking Progress

Last updated **2026-05-03** after the in-code hardening pass (rate limiting, request-size cap, structured JSON logging, soft-delete for articles, seed-password rotation, forced first-login password change, nodemailer v7 upgrade resolving the next-auth peer-dep warning).

App boots, all checks green:
- `npm run lint` ✓ no warnings/errors
- `npx tsc --noEmit` ✓ clean
- `npm run test:run` (Vitest) ✓ 2/2 pass
- `npm run test:e2e` (Playwright) — pending re-run after applying the new migration

This file lists what is **not done** and **what could bite** before the demo or in production. Resolved issues have been removed entirely; partially-resolved ones have been rewritten to focus on what remains.

---

## P0 — Hard blockers (must fix before deploying to anyone)

### 1. Neon DB password is still in plain text in `.env`
- The Gemini key has been rotated ✅ — that risk is gone.
- The Neon connection string in `F:\dhl-kb-system\.env` still contains `npg_0bIT…` in plaintext. `.env` is in `.gitignore` and was never committed (`git log --all --diff-filter=A -- .env` returns nothing), so this is **local-only exposure** today.
- **Action:** before any deployment (Vercel / Railway / similar), put `DATABASE_URL` in the platform's encrypted env-var store, not in a tracked file. Rotate the Neon password from the Neon console once the old value has been pasted into screenshots, slides, demo recordings, etc.

---

## P1 — Will surface during a hackathon demo

### 2. UiPath workflow may have stale JSON.Parse on array fields
- The on-the-wire JSON has always been arrays (only on-disk SQLite serialization changed), so the contract holds. But `uipath/Main.xaml` was written when those fields were stringified inside the DB — if any XAML step does `Deserialize JSON` on `tags` / `steps` / `relatedLinks` expecting a string, it will now error.
- **Action:** open `uipath/Main.xaml` in UiPath Studio, search for any `Deserialize JSON` step that touches `tags` / `steps` / `relatedLinks`, and confirm it expects a `JArray`, not a string.

---

## P2 — Production-readiness debt (won't block the demo, will block real use)

### 4. No password reset, no MFA, no email verification
- Seeded passwords are random by default (or read from `$SEED_ADMIN_PASSWORD` / `$SEED_EDITOR_PASSWORD`) and printed once — credentials no longer in README or CLAUDE.md.
- Forced first-login password change is wired: `User.mustChangePassword` is set on seed (when password was random) and on every admin-created account; middleware redirects to `/change-password?forced=1`; `POST /api/auth/change-password` clears the flag and `useSession().update()` refreshes the JWT in-place.
- **Still missing:** self-serve password reset (forgot-password email), MFA, and email verification on signup.
- **Action:** add a reset-token flow once SMTP is wired (P2-7). MFA + email verification are larger features — separate spike.

### 5. No alerting on top of structured logging
- `src/lib/logger.ts` now emits one-line JSON across Gemini, summary-report, ingest, and process error paths. On Vercel these go to Function Logs, but there's no paging — silent failures in Gemini quota or SMTP can run for days unnoticed.
- **Action:** wire Sentry / BetterStack / a webhook on `error`-level events. Hook into `emit()` in `src/lib/logger.ts` — call sites stay unchanged.

### 6. No backup strategy for Neon
- Neon free tier has point-in-time restore for 7 days. Production needs longer retention + a tested restore drill.
- **Action:** schedule a `pg_dump` from a GitHub Action to S3/R2 nightly once you go live.

### 7. SMTP credentials are blank in `.env`
- The graceful fallback means the UiPath bot no longer crashes, but the summary email is still **never sent** — admins get nothing, and the password-reset flow in P2-4 can't be built without it either.
- **Action:** wire a real SMTP provider (Resend, SendGrid, Postmark) and populate `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`. Resend has a generous free tier and is one env var to set up.

### 8. Vercel Blob path requires `BLOB_READ_WRITE_TOKEN` in production
- Locally, the absence of the token triggers the local-FS fallback — fine for dev. In production (Vercel/Railway) without the token set, every image upload silently writes to the read-only/ephemeral container filesystem and the URL stored in `RawInput.filePath` will 404 on the next request.
- **Action:** in the Vercel dashboard, enable Storage → Blob (auto-populates `BLOB_READ_WRITE_TOKEN`). Verify the ingest path with a screenshot upload before the demo.

---

## P3 — Nice-to-haves spotted along the way

- The `useEffect(() => { load(); }, [])` pattern on 4 dashboard pages is suppressed with `// eslint-disable-next-line` because adding `load` to the dep array would cause infinite re-fetches. The clean fix is to move the fetch out of the component (server component / SWR / React Query) — moderate refactor.
- Prisma 5.22 → 7.x major version available; not urgent but worth a separate upgrade PR with full regression run.
- ESLint 8.57 is end-of-life. Migrate to ESLint 9 + flat config when `eslint-config-next` ships a v9-compatible release.
- Pre-existing 12 npm `audit` vulns (7 moderate, 4 high, 1 critical) — most are transitive from `pdf-parse`/`mammoth`. Audit and pin or replace.
- No `next.config.mjs` configuration for `images.domains` if you ever serve uploaded screenshots through `next/image` (Blob URLs need the Vercel Blob hostname allow-listed).
- `tests/e2e/article-lifecycle.spec.ts` calls real Gemini if `GEMINI_API_KEY` is set, otherwise the heuristic path. CI runs without the key (heuristic path) — that's deliberate and fine, but worth documenting if a future contributor wonders why CI never fails on Gemini quota.
- Rate limiter is in-process. For multi-instance Vercel deploys, swap to Upstash Ratelimit (single-file change in `src/lib/rateLimit.ts`).
- Soft-delete has no UI (no "Trash" view, no restore button). Restoring today requires a manual `UPDATE "Article" SET "deletedAt" = NULL WHERE id = ...`.

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
- Per-key/IP rate limiting on the three RPA-facing endpoints (429 + Retry-After)
- Structured JSON logging on Gemini, summary-report, ingest, process error paths
- Random-by-default seed passwords (printed once on stdout); idempotent re-seed
- Forced first-login password change (middleware redirect to `/change-password`) for seeded + admin-created accounts
- Vitest, Playwright (incl. lifecycle E2E), ESLint, Prettier, GitHub Actions CI with real Postgres + migrations + seed

The system is **demo-ready for the hackathon** and **deploy-ready for a small pilot** once P0-1 (move Neon URL to Vercel env), P2-8 (`BLOB_READ_WRITE_TOKEN` in Vercel), and the new `deletedAt` + `mustChangePassword` migrations are applied. P1-2 (UiPath XAML check) is good housekeeping before any real DHL ops use.
