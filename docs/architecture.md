# Arch — Architecture: Current State, Target State, Migration

> Living document. Code and verified infrastructure state are authoritative;
> older `readme/` plans are historical context only. Updated 2026-09-21.

## 1. Current State (baseline `c40a01c`, verified)

**Runtime:** React 19 + TS + Vite PWA (Netlify static, site `archsrm`,
branch `main`, build `npm run build`, publish `dist`, no site env vars) talking
to an Express auth-proxy (Render, `node server/index.cjs`) that performs Zoho
IAM login, holds upstream cookies per 64-hex-char session token
(`X-Session-Token` header auth, no auth cookies), and GET-proxies SRM pages.
Sessions: Redis if configured, else in-memory. No CI, no test suite (until this
phase), one Supabase migration file with no runtime consumers, push = VAPID
subscription storage only (no sender), `App.tsx` monolith (~4.3k lines).

**Upstreams (independent systems, independent sessions):**

| System | Host | Auth | Evidence |
|---|---|---|---|
| Academia | `academia.srmist.edu.in` (+ Zoho IAM) | Email+password via server proxy | Code + HAR, live |
| Student Portal | `sp.srmist.edu.in` | Separate login, may require image CAPTCHA | Prior HAR investigation notes only — **no portal capture in repo** |

**Data flow today:** browser → `/auth|/proxy` → raw upstream HTML →
frontend `DOMParser` scraping → localStorage caches → render. Source endpoint
names and HTML shapes leak all the way into the UI layer.

## 2. Target State

```text
SRM Academia ──→ Academia Adapter ──┐
                                    ├─→ Canonical Arch Academic Model
Student Portal ─→ Portal Adapter ───┘         (exact source values preserved)
                                              │
                                   Sync + History (snapshots, conflicts)
                                              │
                                   Persistent DB (Supabase/Postgres)
                                              │
                                   Backend API (canonical, paginated)
                                              │
                                   Lazy React UI (route-level splitting)
```

Principles: one Arch account = one SRM identity; never round source data
(raw string + numeric twin); derived values labeled as Arch-calculated;
partial failure (one source down never blanks the other); longitudinal
history (never overwrite — snapshot); bounded device caches, deep history
server-side; user-assisted CAPTCHA only (no solving/bypass); credentials
server-side encrypted, never in localStorage/logs/analytics/Git.

Source priority: attendance = Portal preferred, Academia fallback; marks =
Academia first, Portal fallback; missing ≠ zero; dual-source conflicts keep
both records with freshness-based canonical choice.

## 3. Migration Plan (phase order, each phase tested + committed separately)

1. Inventory/baseline (done) → 2. CLI access (gh✱, netlify ✓, wrangler✱,
   supabase CLI ✓ unlinked) → 3. Canonical DB migrations (versioned, unapplied
   until linked) → 4. Canonical domain model + exact-number lib (this phase) →
   5. Adapter interfaces + Academia adapter over existing fetchers; Portal
   adapter typed stub → 6. Sync engine lib (UI wiring later) → 7. Server-side
   credential vault → 8/9/10. Attendance/marks/calendar on canonical model →
   11. Notifications (device-keyed) → 12. Resources/PDF (sha dedup, R2 hot +
   Archive cold) → 13. Community + reputation (design first) → 14. First-party
   analytics → 15. Admin panel → 16. Cloudflare evaluation → 17. Netlify
   redirect → 18. Perf/QA. (✱ = needs interactive login — owner action.)

## 4. Rollback Plan

- Every phase commits separately; `main` stays deployable (`lint+typecheck+
  build+tests` green). Netlify auto-deploys `main` — keep each push green.
- Pre-migration tags exist for old canary lineages; add a tag before any
  destructive infra cutover.
- Cloudflare/redirect cutovers (phases 16–17) keep the old deployment live
  until the new one is verified, then permanent redirect. Never delete the
  old Netlify site before the new production URL is healthy.
- DB: migrations are additive; no destructive DDL without a tested down path
  and export.

## 5. Free-Tier Limits (re-verified 2026-09-21 unless noted)

- **R2 (official docs):** 10 GB-month storage, 1M Class-A / 10M Class-B ops,
  egress free. Wrangler single-object ops ≤315 MB; rclone for bulk.
  **Open:** whether Worker/Pages R2 binding needs Workers Paid (~$5/mo,
  third-party claim) — confirm before serving design.
- **Netlify (verified via API):** site on free team plan; builds on `main`
  push. Keep builds green and infrequent (batch pushes).
- **Render free:** dynos sleep after idle (cold starts 20–45 s) — known pain;
  Cloudflare evaluation (phase 16) must weigh this.
- **Supabase free:** 500 MB DB quota (repo-noted; re-verify at link time).
  Monitor size; cold/large data splits to R2/Archive, not upgrades.
- **Workers (if used):** 100k req/day free — sync design must use conditional
  fetch, deltas, no infinite polling.

## 6. Known Risks

PII-rich HARs on local disk (gitignored, never committed); upstream HTML
parsing brittleness (mitigated by header-pattern parsing + parser-version
tracking, not eliminable); in-memory sessions without Redis; planner-year
rollover; CAPTCHA blocks portal automation (user-assisted flow required);
background-sync throttling on mobile OS (never promise exact 30 s); stale
`origin/canary` lineage already retired via tags; no CI until this phase.
