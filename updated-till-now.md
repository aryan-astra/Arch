# updated-till-now.md

This is a full handoff document for the `O:\academis-clone` project.

I generated this from:

- Repository source code (frontend, backend, configs, assets).
- Git history (`11` commits currently on `main`/`canary`).
- Build artifacts (`dist`, `dev-dist`).
- Runtime/deploy logs and debugging history captured in this session.

I explicitly call out uncertainty where direct evidence was not available.

---

## 0. LATEST RELEASE UPDATE (v3)

This section captures the most recent work completed after the earlier `3c3b402` baseline and before the current local release commit.

### Marks page redesign (mobile-first)

- Reworked the compact marks mini-chart to start from **origin 0** and then plot real tests (`FT 1`, `LLJ 1`, etc.) in sequence.
- Added per-point **dotted vertical guide lines** from plotted value to x-axis label for faster visual parsing.
- Switched line/area interpolation to smoother curves (`monotone`) and tuned animation timing for less abrupt motion.
- Removed mini-chart summary pills such as **Latest** and **Peak** to reduce clutter.
- Increased readability of per-test marks chips (`label + scored/max`) with larger, bolder typography.
- Tightened spacing between subject header, chart, and marks chips to remove wasted vertical space on phones.
- Refined tooltip and chart framing contrast so values are legible in dense dark UI conditions.

### Prediction + optimizer hardening completed in this phase

- Holiday Optimizer now enforces strict safety logic using **75% + 1-class margin** per subject.
- Optimizer now avoids optimistic impossible outputs by requiring readiness and rejecting unrecoverable plans.
- Added clear prep/readiness signaling so users can see when they must attend classes before full-day leave suggestions.
- Optimizer output moved to a **calendar-first visual view** with month navigation and day markers.
- Added custom target percentage support and improved solver behavior for future-focused planning.

### Release metadata changes for this handoff

- Added a new top changelog entry: **`v3`** in `src/data/changelog.json`.
- Bumped package version metadata to **`3.0.0`** in both:
  - `package.json`
  - `package-lock.json`

## 1. PROJECT OVERVIEW

### What this project is

This project is **Arch**, a mobile-first remake of `academia.srmist.edu.in`.

Primary goals:

- Faster daily student workflow than the original portal.
- Compact UI with less navigation friction.
- Better session reliability and fewer random logouts.
- PWA install flow so users can use it as an app-like experience.
- Better timetable + attendance interpretation, including practical classes.

### Problem it solves

The original portal experience is heavier, less compact, and can be frustrating on mobile (slow page transitions, repetitive navigation, session interruptions). Arch reduces this by:

- Consolidating important surfaces in one SPA (Home, Attendance, Timetable, Calendar, Profile).
- Keeping data fresh with adaptive polling.
- Caching per-user tab data for fast reopen.
- Persisting backend sessions (Redis when configured).

### Target users

- SRM students (mobile-heavy usage).
- Especially users who check attendance, day order, timetable, and profile details frequently.
- Admin usage metrics are restricted to admin identity (default `as6977`).

### Current state (as of this audit)

- **Functional** and deployable.
- `main` and `canary` both point to commit `3c3b402`.
- Frontend + backend build and lint pass locally:

```bash
npm run lint
npm run build
```

- Production-style deployment model is configured:
  - Frontend: Netlify (`public\_redirects`).
  - Backend: Render (`node server/index.cjs`).
- Redis-backed sessions are supported and were confirmed in runtime logs in prior debugging.
- Practical-slot mapping has been hardened in multiple iterations, culminating in timetable metadata slot overrides (`3c3b402`).

### Stack and why it was chosen

- **React 19 + TypeScript + Vite**
  - Fast dev/build loop, strong type safety, SPA ergonomics.
- **Express (Node backend)**
  - Simple custom auth/proxy server for SRM upstream session orchestration.
- **axios + axios-cookiejar-support + tough-cookie**
  - Needed to maintain Zoho/SRM cookie state server-side.
- **Redis (optional, recommended in production)**
  - Persistent sessions and push subscription storage across restarts.
- **vite-plugin-pwa + Workbox**
  - Installable PWA, offline/runtime caching strategy.
- **framer-motion + recharts + lucide-react**
  - UI transitions, trend charting, iconography.

### High-level architecture

```text
+---------------------------+            +------------------------------+
| Mobile Browser / PWA App |            | Render Express Backend       |
| React SPA (Vite build)   |  /auth/*   | server/index.cjs             |
| src/App.tsx              +----------->| - Zoho IAM login orchestration|
| src/lib/api.ts           |  /proxy/*  | - Session token store         |
| local caches + token     +----------->| - Auth drift detection        |
+-------------+-------------+            | - Admin metrics endpoints     |
              |                          | - Push subscription endpoints |
              |                          +---------------+--------------+
              |                                          |
              |                               upstream HTTP(S) with jar
              v                                          v
      Netlify static hosting                    academia.srmist.edu.in
      (public/_redirects)                       + Zoho accounts endpoints
              |
              +--> optional Redis Cloud (sessions + push subscriptions)
```

---

## 2. DIRECTORY STRUCTURE

### 2.1 Top-level folders and files

| Path | Type | Purpose |
|---|---|---|
| `.env.example` | file | Example env var file (dev fallback cookie var). |
| `.git` | folder | Git metadata/history (internal). |
| `.gitignore` | file | Ignore rules, including `dist`, `dev-dist`, root markdown files except `README.md`. |
| `AI_PROJECT_CONTEXT.txt` | file | Prior AI handoff context summary. |
| `components.json` | file | shadcn-style component config and aliases. |
| `dev-dist\` | folder | Development PWA worker artifacts. |
| `dist\` | folder | Production build output from Vite/PWA. |
| `eslint.config.js` | file | ESLint flat config for TS/React hooks/refresh. |
| `index.html` | file | SPA shell, viewport/meta, startup cache recovery script. |
| `node_modules\` | folder | Third-party dependencies (generated). |
| `package-lock.json` | file | Dependency lock graph. |
| `package.json` | file | Project scripts/dependencies. |
| `public\` | folder | Static assets copied to build output. |
| `README.md` | file | Main project documentation. |
| `server\` | folder | Backend auth/proxy server. |
| `src\` | folder | Frontend source code. |
| `tsconfig.app.json` | file | TS config for app source. |
| `tsconfig.json` | file | TS project references. |
| `tsconfig.node.json` | file | TS config for Vite config runtime typing. |
| `vite.config.ts` | file | Vite server/build/PWA config. |

### 2.2 Full file inventory in project workspace

This inventory includes all non-hidden project files found in this workspace. `node_modules` and `.git` internals are intentionally not expanded file-by-file because they are generated/external.

```text
O:\academis-clone\.env.example
O:\academis-clone\.gitignore
O:\academis-clone\AI_PROJECT_CONTEXT.txt
O:\academis-clone\components.json
O:\academis-clone\dev-dist\sw.js
O:\academis-clone\dev-dist\workbox-3bcf8611.js
O:\academis-clone\dev-dist\workbox-6e08a099.js
O:\academis-clone\dist\_redirects
O:\academis-clone\dist\404-sad.jpg
O:\academis-clone\dist\404.html
O:\academis-clone\dist\apple-touch-icon.png
O:\academis-clone\dist\assets\App-B994Ji7b.js
O:\academis-clone\dist\assets\charts-vendor-Dy6THqTQ.js
O:\academis-clone\dist\assets\final-arch-logo-CrW2IFtR.svg
O:\academis-clone\dist\assets\index-efMrlDmm.js
O:\academis-clone\dist\assets\index-Wc7Xqw_D.css
O:\academis-clone\dist\assets\MarksLineChart-DxmNhnru.js
O:\academis-clone\dist\assets\motion-vendor-BMvZHr3s.js
O:\academis-clone\dist\assets\virtual_pwa-register-D-AcwcGi.js
O:\academis-clone\dist\assets\workbox-window.prod.es5-BIl4cyR9.js
O:\academis-clone\dist\favicon.svg
O:\academis-clone\dist\index.html
O:\academis-clone\dist\manifest.webmanifest
O:\academis-clone\dist\pwa-192.png
O:\academis-clone\dist\pwa-512.png
O:\academis-clone\dist\pwa-maskable-512.png
O:\academis-clone\dist\readme\attendance-page-sanitized.png
O:\academis-clone\dist\readme\home-page-sanitized.png
O:\academis-clone\dist\readme\mobile-home-sanitized.png
O:\academis-clone\dist\sw.js
O:\academis-clone\dist\vite.svg
O:\academis-clone\dist\workbox-3bcf8611.js
O:\academis-clone\eslint.config.js
O:\academis-clone\index.html
O:\academis-clone\package-lock.json
O:\academis-clone\package.json
O:\academis-clone\public\_redirects
O:\academis-clone\public\404-sad.jpg
O:\academis-clone\public\404.html
O:\academis-clone\public\apple-touch-icon.png
O:\academis-clone\public\favicon.svg
O:\academis-clone\public\pwa-192.png
O:\academis-clone\public\pwa-512.png
O:\academis-clone\public\pwa-maskable-512.png
O:\academis-clone\public\readme\attendance-page-sanitized.png
O:\academis-clone\public\readme\home-page-sanitized.png
O:\academis-clone\public\readme\mobile-home-sanitized.png
O:\academis-clone\public\vite.svg
O:\academis-clone\README.md
O:\academis-clone\server\index.cjs
O:\academis-clone\src\App.tsx
O:\academis-clone\src\assets\academia-plus-logo.svg
O:\academis-clone\src\assets\arch-logo-transparent.png
O:\academis-clone\src\assets\arch-logo.svg
O:\academis-clone\src\assets\final-arch-logo.svg
O:\academis-clone\src\assets\react.svg
O:\academis-clone\src\components\AcademiaLogo.tsx
O:\academis-clone\src\components\expandable-tabs.tsx
O:\academis-clone\src\components\HeroBadge.tsx
O:\academis-clone\src\components\MarksLineChart.tsx
O:\academis-clone\src\components\ProgressiveBlur.tsx
O:\academis-clone\src\data\changelog.json
O:\academis-clone\src\data\real-data.ts
O:\academis-clone\src\index.css
O:\academis-clone\src\lib\api.ts
O:\academis-clone\src\lib\storage.ts
O:\academis-clone\src\main.tsx
O:\academis-clone\src\vite-env.d.ts
O:\academis-clone\tsconfig.app.json
O:\academis-clone\tsconfig.json
O:\academis-clone\tsconfig.node.json
O:\academis-clone\vite.config.ts
```

### 2.3 Major file deep roles (imports, dependencies, design choices)

#### `src\App.tsx`

- **Role**
  - Main application orchestration and all screen components (login, home, attendance, schedule, calendar, profile, cooking).
  - State, caching, polling, session validation, PWA prompts, push enrollment, admin metrics panel.
- **Key imports**
  - From `src\lib\api.ts` (line 8): data fetch/parsers, auth APIs, metrics APIs.
  - From `src\lib\storage.ts` (line 10): snapshot persistence.
  - From `src\data\changelog.json` (line 15): changelog source.
- **Who depends on it**
  - `src\main.tsx` dynamically imports and mounts it.
- **Design decisions**
  - Cache schema typed via `TabCachePayload` (`src\App.tsx:329-340`).
  - Cache invalidation versioning (`TAB_CACHE_VERSION = 4`, line 344) and TTL cleanup logic (`readTabCache`, `cleanupStaleLocalEntries`).
  - Batch fallback strictness:
    - `fallbackTimetableForBatch` returns default only for batch 2 (`lines 424-426`).
  - Practical slot correctness:
    - `applyCourseSlotOverrides` rewrites attendance slots from timetable metadata (`lines 788-801`).
  - Cooking page data moved to JSON and latest version auto-expanded (`lines 2471-2527`).
  - Admin metrics only visible for admin profile identity (`showAdminMetrics` at line 2605).

#### `src\lib\api.ts`

- **Role**
  - Frontend API client + HTML/JSON parsers for attendance, timetable, profile, calendar, circulars, notifications, push, admin self metrics.
- **Key imports**
  - `BATCH2_TIMETABLE`, `SLOT_TIMES`, mock types/data from `src\data\real-data.ts`.
- **Who depends on it**
  - `src\App.tsx`.
- **Design decisions**
  - Parsing from pageSanitizer payload (`extractInnerHtml`, line 21).
  - Attendance parsing made table-header driven and practical aware (`parseAttendancePage`, line 86).
  - Timetable course metadata includes:
    - `creditsByCode`
    - `slotByCourseKey` (`parseTimetableCourseMetadata`, lines 552+).
  - Day-order schedule mapping:
    - `getTodayClasses` uses slot token matching (`line 845`).
  - Batch fallback now only batch 2 fallback when timetable parse is insufficient (`lines 700-709`).

#### `server\index.cjs`

- **Role**
  - Auth service + upstream proxy + session lifecycle + admin metrics + push subscription endpoints.
- **Key imports**
  - `express`, `axios`, `axios-cookiejar-support`, `tough-cookie`, `redis`, `https`.
- **Who depends on it**
  - `npm run dev`, `npm run dev:server`, Render start command `node server/index.cjs`.
- **Design decisions**
  - Optional Redis store with memory fallback (`REDIS_URL`, lines 35, 182+).
  - Scoped TLS bypass only for SRM requests via `https.Agent` (`SRM_TLS_INSECURE`, lines 36, 43-45), replacing global process TLS disable.
  - Auth drift detection for proxy responses that return login HTML with `200` (`hasUpstreamAuthDrift`, lines 293-306).
  - Deterministic auth reason codes in responses/log events (`reason` fields used throughout routes).
  - Admin metrics endpoint split:
    - Header-token endpoint `/auth/admin/metrics`.
    - Session-auth endpoint `/auth/admin/metrics/self`.

#### `src\index.css`

- **Role**
  - Central visual system (all theme classes, layout rules, screen components, badges, nav behavior, cooking screen styling).
- **Who depends on it**
  - Imported by `src\main.tsx`.
- **Design decisions**
  - Single-file style strategy for fast iteration.
  - Mobile safe-area and compact spacing style primitives.
  - Added changelog/cooking symbols and bottom-only blur visual behavior.

#### `src\lib\storage.ts`

- **Role**
  - Session snapshot persistence (trusted local vs browser session).
- **Design decisions**
  - Trusted TTL `180d`; browser TTL `2d`.
  - Central `load/persist/refresh/clear` to avoid ad-hoc key management.

#### `src\main.tsx`

- **Role**
  - Bootstrap entrypoint.
- **Design decisions**
  - Defensive startup with one-time cache/service-worker recovery if mount fails.

#### `vite.config.ts`

- **Role**
  - Dev proxy setup, build chunking, PWA config.
- **Design decisions**
  - Proxy `/auth` and `/proxy` to local backend in dev.
  - Optional legacy `/api` direct SRM path for fallback.
  - Manual chunk split for motion/charts vendors.
  - Workbox runtime caching policy tuned for documents/assets/media.

---

## 3. COMPLETE TECHNICAL APPROACH

### 3.1 Strategy in one sentence

Build a compact React SPA that uses a dedicated backend auth/proxy service for real SRM data, then harden session and parsing reliability incrementally with cache + Redis + auth-drift handling.

### 3.2 Architecture decisions and order of implementation

1. Build complete portal shell with real data routes and mobile-first UI.
2. Add reliability features:
   - session snapshot persistence
   - backend reason-coded auth handling
   - local tab cache hygiene
3. Add backend persistence and observability:
   - Redis session store
   - admin metrics endpoints
4. Add UX/performance improvements:
   - nav badge polling
   - chunk splitting
   - changelog screen and JSON data source
5. Fix timetable correctness issues:
   - batch fallback strictness
   - practical slot parsing and practical detection
   - live-data driven slot override mapping (`LAB` -> actual slot tokens)

### 3.3 Approaches tried and why

#### Sessions

- **Tried/used**: in-memory sessions first.
  - Fast to bootstrap, but non-persistent across restarts.
- **Then**: Redis-backed session store with TTL touch.
  - Chosen to survive restarts and reduce random logouts.
  - Added touch optimization to reduce write bandwidth.

#### TLS handling

- **Old/undesirable pattern**: global Node TLS disable.
- **Chosen**: scoped SRM-only insecure agent toggle (`SRM_TLS_INSECURE=1`) for fallback only.
  - Better security posture and clearer operational risk boundaries.

#### Timetable mapping

- **Initial fallback behavior**: broad fallback to batch 2 map.
- **Issue**: batch 1 users got wrong timetable.
- **Chosen**:
  - strict fallback only for known batch 2.
  - parse timetable and metadata first.
  - avoid defaulting unknown batch to batch 2.

#### Practical class matching

- **Initial issue**: practical classes missing.
- **Attempts**:
  - stronger slot token parsing.
  - header-driven attendance parser.
  - final live-data fix: attendance practical slot value can be `LAB`, which cannot match day-order tokens directly.
- **Chosen final design**:
  - parse `slotByCourseKey` from timetable metadata.
  - rewrite attendance slot before day-order matching.

#### Changelog UX

- **Initial**: inline changelog in profile.
- **Chosen**:
  - dedicated Cooking page.
  - changelog moved to JSON data file.
  - latest version auto-open based on semantic compare.

### 3.4 Alternatives considered and rejected

- Full backend database for all app data:
  - Rejected for this phase; unnecessary complexity for read-mostly portal proxy.
- Public admin metrics endpoint:
  - Rejected due privacy exposure risk.
- Separate user-visible push settings panel:
  - Reduced and integrated into attendance alert flow for cleaner profile UI.
- Continue hardcoded timetable map for all users:
  - Rejected due correctness failures for batch and practical mappings.

### 3.5 Packages/libraries/services (version, reason, integration)

From `package.json`:

| Dependency | Version | Why | Where integrated |
|---|---:|---|---|
| `axios` | `^1.13.6` | HTTP requests to Zoho/SRM from backend | `server\index.cjs` |
| `axios-cookiejar-support` | `^6.0.5` | Attach cookie jar to axios | `server\index.cjs` |
| `tough-cookie` | `^6.0.0` | Cookie jar management | `server\index.cjs` |
| `express` | `^5.2.1` | Backend route server | `server\index.cjs` |
| `cors` | `^2.8.6` | CORS handling | `server\index.cjs` |
| `redis` | `^5.11.0` | Persistent sessions and push subscription storage | `server\index.cjs` |
| `react` / `react-dom` | `^19.2.0` | SPA rendering | `src\main.tsx`, `src\App.tsx` |
| `framer-motion` | `^12.35.2` | UI motion/animations | `src\App.tsx`, components |
| `recharts` | `^3.8.0` | Marks trend chart | `src\components\MarksLineChart.tsx` |
| `lucide-react` | `^0.577.0` | Icons | `src\App.tsx`, nav |

Dev stack:

| Tool | Version | Purpose |
|---|---:|---|
| `vite` | `^7.3.1` | Build/dev server |
| `typescript` | `~5.9.3` | Type checking |
| `vite-plugin-pwa` | `^1.2.0` | PWA manifest/SW generation |
| `eslint` + plugins | `^9.x` | Linting |
| `concurrently` | `^9.2.1` | Run backend + frontend dev together |

External services:

- `academia.srmist.edu.in` and Zoho account flow endpoints.
- Render for backend hosting.
- Netlify for frontend hosting and rewrites.
- Redis Cloud (optional but used in production rollout).

---

## 4. CHRONOLOGICAL WORK LOG

> Note: This timeline combines hard evidence from git history + command outputs + session runtime/debug logs.  
> Exact command text for older changes before this audit is reconstructed where direct terminal history was not preserved.

### Step 0: Base scaffold and deployment-ready setup

- **Attempted**
  - Create full app + backend scaffold with deploy docs/assets.
- **Change**
  - Commit `450bc94` created 41 files.
- **Expected**
  - Bootstrapped project with frontend/backed/PWA/deploy config.
- **Actual**
  - Achieved; repository baseline established.

### Step 1: Session/cache/admin reliability bundle

- **Attempted**
  - Improve stability and observability.
- **Change**
  - Commit `feecf01`.
  - Large edits in `server\index.cjs`, `src\App.tsx`, `src\lib\api.ts`, docs.
- **Expected**
  - Better session handling, local cache management, admin metrics.
- **Actual**
  - Implemented with reason-coded auth and cache hygiene mechanics.

### Step 2: Notification badge and perf chunking

- **Attempted**
  - Improve profile signal and JS bundle load shape.
- **Change**
  - Commit `67be440`.
  - `ExpandableNav` badge support, profile polling, chunk splitting in Vite.
- **Expected**
  - Better UX + improved cache reuse/perf.
- **Actual**
  - Implemented and documented.

### Step 3: Redis session touch bandwidth optimization

- **Attempted**
  - Reduce frequent Redis payload rewrites.
- **Change**
  - Commit `7feff7f`.
  - Session touch path uses TTL extension, periodic full rewrite.
- **Expected**
  - Lower Redis/network load with same session TTL semantics.
- **Actual**
  - Implemented.

### Step 4: Push design scaffold + profile panels

- **Attempted**
  - Build closed-app push groundwork and profile visibility.
- **Change**
  - Commit `ac806bb`.
- **Expected**
  - Add push readiness APIs and profile support views.
- **Actual**
  - Implemented.

### Step 5: Push subscription endpoints and controls

- **Attempted**
  - Add save/delete subscription flow.
- **Change**
  - Commit `b923744`.
- **Expected**
  - Store per-user push subscriptions, expose in metrics.
- **Actual**
  - Implemented in backend and frontend APIs.

### Step 6: Cooking/changelog/profile UX revision

- **Attempted**
  - Improve changelog UX, compactness, and maintainability.
- **Change**
  - Commit `49fd70f`.
  - Added `src\components\ProgressiveBlur.tsx`, `src\data\changelog.json`, json import support.
- **Expected**
  - Dedicated changelog screen and easier release-note maintenance.
- **Actual**
  - Implemented.

### Step 7: Batch-aware timetable correctness fix

- **Attempted**
  - Fix batch 1 seeing batch 2 timetable.
- **Change**
  - Commit `26b6477`.
  - `src\App.tsx`, `src\lib\api.ts`.
- **Expected**
  - Strict fallback behavior by batch.
- **Actual**
  - Implemented and shipped.

### Step 8: Practical slot parsing fix

- **Attempted**
  - Fix missing practical class display.
- **Change**
  - Commit `98f4b8d`.
  - `src\lib\api.ts`.
- **Expected**
  - Better tokenization and practical detection.
- **Actual**
  - Partial improvement; edge cases still remained.

### Step 9: Header-driven attendance parser hardening

- **Attempted**
  - Resist SRM table column drift.
- **Change**
  - Commit `ae4e24f`.
  - `src\lib\api.ts`.
- **Expected**
  - Practicals parse even if headers/column order shift.
- **Actual**
  - Improved parser robustness; still needed final mapping fix.

### Step 10: Live MCP investigation and final practical mapping fix

- **Attempted**
  - Use live login/network behavior to root cause practical mismatch.
- **Change**
  - Commit `3c3b402`.
  - Added course slot override flow from timetable metadata.
- **Expected**
  - Attendance rows with generic `LAB` slot map to actual timetable slot tokens before day-order matching.
- **Actual**
  - Final practical matching fix integrated.

### Step 11: Branch synchronization and push operations

- **Attempted**
  - Sync `main` and `canary`; push both.
- **Observed error**
  - GitHub privacy rejection (`GH007`) due private email exposure.
- **Fix attempted**
  - Set local git email to GitHub noreply and rewrite unpushed commit author metadata.
- **Actual**
  - Push succeeded after re-authoring.

### Step 12: Redis rollout troubleshooting

- **Attempted**
  - Connect Render backend to Redis Cloud.
- **Observed error**
  - TLS/URL formatting issue:

```text
[session-store] Redis error: ... SSL routines:tls_get_more_records:packet length too long
```

- **Root cause**
  - Malformed `REDIS_URL` and protocol mismatch in env variable.
- **Fix**
  - Corrected URL format and redeployed.
- **Actual**
  - Backend log later showed:

```text
[session-store] Redis session store connected.
```

And health endpoint:

```json
{"ok":true,"sessions":0,"users":0,"pushSubscriptions":0,"store":"redis"}
```

### Step 13: This documentation audit pass

- **Attempted**
  - Full repo/commit/artifact audit and handoff doc creation.
- **Commands executed (examples)**

```bash
git --no-pager status --short
git --no-pager log --reverse --pretty=format:"@@@ %H|%ad|%an|%s" --date=iso --name-status
git --no-pager ls-files
npm run lint && npm run build
```

- **Actual**
  - `updated-till-now.md` created with all 12 required sections.

---

## 5. ALL CHANGES MADE (File-Level)

### 5.1 Complete commit list (chronological)

```text
450bc94 Deploy-ready setup for Render + Netlify
feecf01 feat: stabilize sessions, caching, and admin metrics
67be440 feat: add profile badge and perf chunking
7feff7f perf: reduce Redis session touch bandwidth
ac806bb feat: add profile galleries and push design scaffold
b923744 Add push subscription beta endpoints and profile controls
49fd70f feat: refine cooking changelog and profile UX
26b6477 fix: enforce batch-aware timetable selection
98f4b8d fix: restore practical timetable slot matching
ae4e24f fix: harden practical parsing from attendance tables
3c3b402 fix: map practical slots from timetable metadata
```

### 5.2 File-to-change mapping from git history

```text
.env.example	A	450bc94
.gitignore	A	450bc94
AI_PROJECT_CONTEXT.txt	A	feecf01
components.json	A	450bc94
eslint.config.js	A	450bc94
index.html	A	450bc94
package-lock.json	A,M	450bc94,feecf01
package.json	A,M	450bc94,feecf01
public/_redirects	A	450bc94
public/404-sad.jpg	A	450bc94
public/404.html	A	450bc94
public/apple-touch-icon.png	A	450bc94
public/favicon.svg	A	450bc94
public/pwa-192.png	A	450bc94
public/pwa-512.png	A	450bc94
public/pwa-maskable-512.png	A	450bc94
public/readme/attendance-page-sanitized.png	A	450bc94
public/readme/home-page-sanitized.png	A	450bc94
public/readme/mobile-home-sanitized.png	A	450bc94
public/vite.svg	A	450bc94
README.md	A,M	450bc94,feecf01,67be440,ac806bb,b923744,49fd70f
server/index.cjs	A,M	450bc94,feecf01,7feff7f,ac806bb,b923744,49fd70f
src/App.tsx	A,M	450bc94,feecf01,67be440,ac806bb,b923744,49fd70f,26b6477,3c3b402
src/assets/academia-plus-logo.svg	A	450bc94
src/assets/arch-logo-transparent.png	A	450bc94
src/assets/arch-logo.svg	A	450bc94
src/assets/final-arch-logo.svg	A	450bc94
src/assets/react.svg	A	450bc94
src/components/AcademiaLogo.tsx	A	450bc94
src/components/expandable-tabs.tsx	A,M	450bc94,67be440
src/components/HeroBadge.tsx	A	450bc94
src/components/MarksLineChart.tsx	A	450bc94
src/components/ProgressiveBlur.tsx	A	49fd70f
src/data/changelog.json	A	49fd70f
src/data/real-data.ts	A	450bc94
src/index.css	A,M	450bc94,feecf01,67be440,ac806bb,b923744,49fd70f
src/lib/api.ts	A,M	450bc94,feecf01,67be440,ac806bb,b923744,49fd70f,26b6477,98f4b8d,ae4e24f,3c3b402
src/lib/storage.ts	A	450bc94
src/main.tsx	A	450bc94
src/vite-env.d.ts	A	450bc94
tsconfig.app.json	A,M	450bc94,49fd70f
tsconfig.json	A	450bc94
tsconfig.node.json	A	450bc94
vite.config.ts	A,M	450bc94,67be440
```

### 5.3 File-by-file change notes and impact

#### Backend and API-critical files

- `server\index.cjs`
  - **Before**: baseline auth/proxy/session logic.
  - **After**:
    - Redis integration (`REDIS_URL`, session key prefixes).
    - reason-coded auth events and admin metrics payloading.
    - push status/public-key/subscription endpoints.
    - scoped TLS insecure toggle.
    - upstream auth drift detection in `/proxy`.
  - **Impact**: major reliability + observability + security posture improvement.

- `src\lib\api.ts`
  - **Before**: baseline parse/fetch mapping.
  - **After**:
    - robust header-driven attendance parsing.
    - better practical inference.
    - timetable metadata parsing with `slotByCourseKey`.
    - strict batch fallback behavior.
    - push/admin API client additions.
  - **Impact**: fixed batch mismatch and practical visibility edge cases.

- `src\App.tsx`
  - **Before**: baseline screens and state.
  - **After**:
    - tab cache schema/versioning and cleanup.
    - dynamic safe-area handling for iOS behavior.
    - adaptive attendance polling and notifications.
    - admin metrics card (restricted by user identity).
    - Cooking screen and JSON changelog.
    - course slot override application pipeline.
  - **Impact**: central UX/performance/reliability gains.

#### Config and docs files

- `README.md`
  - Updated over multiple commits with deployment, env vars, admin metrics, push beta, and changelog notes.

- `vite.config.ts`
  - Added vendor chunk splitting and tuned PWA/workbox behavior.

- `tsconfig.app.json`
  - Added `resolveJsonModule: true` to support importing `src\data\changelog.json`.

- `package.json` / `package-lock.json`
  - Dependency graph updates tied to stabilization work (including Redis use path).
  - Scripts retained around dev/build/lint.

#### New feature/data/component files

- `src\components\ProgressiveBlur.tsx` (new in `49fd70f`)
  - Reusable blur overlay used by Cooking page.

- `src\data\changelog.json` (new in `49fd70f`)
  - External changelog data source.

- `AI_PROJECT_CONTEXT.txt` (new in `feecf01`)
  - Internal AI context summary; not runtime-critical.

#### UI and component support files

- `src\index.css`
  - Large styling evolution for compact mobile UX, nav badges, profile cards, cooking visuals.

- `src\components\expandable-tabs.tsx`
  - Badge support and spacing updates for profile notification counts.

#### Created-once baseline files (no subsequent git edits)

- Static assets:
  - `public\*` icons/images/404 pages/readme screenshots.
  - `src\assets\*` logos/image assets.
- Base app wiring:
  - `src\main.tsx`, `src\lib\storage.ts`, `src\data\real-data.ts`, `src\components\AcademiaLogo.tsx`, `src\components\HeroBadge.tsx`, `src\components\MarksLineChart.tsx`, `src\vite-env.d.ts`.
- Tooling:
  - `.env.example`, `.gitignore`, `eslint.config.js`, `components.json`, `tsconfig*.json`, `index.html`.

#### Files deleted

- No tracked files were deleted in git history during this timeline.

---

## 6. ERRORS, BUGS, AND PROBLEMS ENCOUNTERED

### 6.1 GitHub push privacy block

- **Observed**

```text
GH007: Your push would publish a private email address
```

- **Root cause**
  - Commit author email not set to GitHub noreply for pushes under privacy constraints.
- **What was tried**
  - Set local git config user email to `aryan-astra@users.noreply.github.com`.
  - Rewrote unpushed commit authors (`--reset-author` flow).
- **Final resolution**
  - Push succeeded for `main` and `canary`.

### 6.2 Redis TLS packet-length failure

- **Observed**

```text
[session-store] Redis error: ... SSL routines:tls_get_more_records:packet length too long
```

- **Root cause**
  - Malformed `REDIS_URL` / wrong connection format mismatch.
- **What was tried**
  - Environment variable review.
  - Corrected Redis URL formatting (with proper scheme/host/password/port).
- **Final resolution**

```text
[session-store] Redis session store connected.
```

### 6.3 Batch-1 users seeing batch-2 timetable

- **Observed behavior**
  - Wrong timetable shown for batch 1.
- **Root cause**
  - Too-permissive fallback behavior and stale cache precedence.
- **Fixes**
  - Strict fallback only for confirmed batch 2.
  - Better merge precedence for fresh server data.
  - Cache schema version bump to invalidate stale timetable cache.
- **Status**
  - Marked resolved in code (`26b6477` + related logic in `App.tsx`/`api.ts`).

### 6.4 Practicals not showing

- **Observed behavior**
  - Theory appears, practical classes missing.
- **Root causes (iterative)**
  1. Slot token normalization not robust enough.
  2. Attendance parser relied on fragile assumptions when columns drifted.
  3. Live data showed practical attendance slot may be `LAB`, not timetable token (`Pxx`, `Lxx`) required for day-order slot match.
- **Fix attempts**
  - `98f4b8d`: slot token and practical detection improvements.
  - `ae4e24f`: header-driven parser hardening.
  - `3c3b402`: final slot override mapping from timetable metadata (`slotByCourseKey`).
- **Status**
  - Final approach implemented; user should hard refresh and redeploy to fully validate.

### 6.5 Random logout issues

- **Observed behavior**
  - Session drops in long-running usage.
- **Root cause**
  - In-memory backend session store resets on restart/sleep.
  - Potential auth drift responses from upstream returning login HTML with `200`.
- **Fixes**
  - Redis-backed sessions.
  - `/proxy` auth-drift detection and deterministic `401`.
  - client-side session validation + reason handling.
- **Status**
  - Substantially improved; still dependent on deployment uptime and env correctness.

### 6.6 Render sleep/uptime constraint

- **Observed behavior**
  - Free-tier sleep can interrupt session continuity.
- **Root cause**
  - Platform behavior, not app code.
- **Workaround**
  - Use always-on plan for best reliability, and Redis persistence.
- **Status**
  - Architectural constraint remains if free-tier is used.

### 6.7 HAR file unavailable in repo during this audit

- **Observed**
  - Expected `O:\academis-clone\academia.srmist.edu.in.har` not found:

```text
HAR_MISSING
```

- **Impact**
  - Live MCP/network validation was used instead in previous debugging.

### 6.8 "No open ports detected" deploy-side symptom

- **Observed in earlier logs**
  - Render noted no open ports while backend emitted repeated Redis TLS errors.
- **Likely cause**
  - Process startup flow blocked/no successful stable initialization due repeated connection issue.
- **Resolution**
  - Correct Redis configuration and restart.

---

## 7. CURRENT STATE (AS OF NOW)

### 7.1 Working correctly

- Login flow through backend auth proxy.
- Session validation and logout handling with reason awareness.
- Attendance + internal marks parsing and display.
- Timetable and day-order schedule rendering.
- Calendar parsing and ICS export.
- Profile details, advisors, theme selection, feedback link.
- Cooking changelog screen sourced from JSON.
- PWA install prompts (Android + iOS guidance) and service worker update handling.
- Notification count badge polling.
- Admin self metrics panel for admin identity.
- Build/lint pass.

### 7.2 Broken or incomplete

- Full closed-app push sender pipeline is not complete:
  - subscription endpoints exist.
  - sender worker + delivery trigger pipeline still pending.
- Cumulative analytics (DAU/WAU/MAU) is not implemented; current metrics are active sessions/users snapshot.

### 7.3 Partially working / potentially unstable areas

- Upstream HTML parser dependency:
  - If SRM changes markup significantly, parser breakage can recur.
- Reliability still depends on host uptime policy:
  - free-tier sleep/restart can degrade user experience despite Redis.
- Practical mapping fix is code-complete, but production confirmation depends on full redeploy + hard refresh by end users.

### 7.4 Known technical debt / hardcoded assumptions

- `ADMIN_PROFILE_ID` default admin identity is hardcoded in frontend logic (`as6977`) (`src\App.tsx:184+`).
- `FEEDBACK_EMAIL` hardcoded in frontend (`src\App.tsx:302`).
- Academic planner years/pages are hardcoded for 2025-26 in API fetch function.
- `BATCH2_TIMETABLE` static map remains as fallback; full generalized timetable extraction is not guaranteed for every upstream pattern.
- `.gitignore` excludes root markdown files except README, so this handoff file is ignored by default.

---

## 8. PENDING TASKS AND NEXT STEPS

### 8.1 Planned but not implemented

1. Closed-app push sender worker pipeline:
   - trigger on attendance deltas server-side.
   - payload dispatch and endpoint invalidation cleanup.
2. Production verification pass after latest practical mapping change:
   - hard refresh client.
   - validate practicals for affected users.
3. Optional deeper analytics:
   - historical daily active users instead of real-time-only counters.

### 8.2 Suggested continuation order

1. Verify current production behavior post `3c3b402`.
2. Implement sender worker for push delivery.
3. Add endpoint cleanup for invalid push subscriptions (`410/404` handling).
4. Add optional analytics persistence if required.
5. Continue with branch discipline (`feature/*` -> `canary` -> `main`).

### 8.3 Open decisions still needed

- Whether to keep free Render tier (sleep risk) or use always-on.
- Whether admin metrics should include longer-term trend analytics.
- Whether to introduce generalized timetable fallback for non-batch2 cases if parser fails.

### 8.4 Dependencies/blockers

- Web push full rollout depends on:
  - valid VAPID keys in env.
  - backend worker/trigger implementation.
  - stable always-on backend for reliable dispatch timing.
- Parser resilience depends on upstream HTML consistency.

---

## 9. ENVIRONMENT AND SETUP

### 9.1 Environment observed during this audit

- OS: `Windows_NT`
- Repo path: `O:\academis-clone`
- Node: `v24.14.0` (local audit machine)
- npm: `11.9.0`
- Python: `3.13.12` (present, not required by this project)
- Go: not installed in this environment (not required)
- Render runtime observed in deployment logs: Node `22.22.0`

### 9.2 Fresh machine setup

```bash
git clone https://github.com/aryan-astra/Arch.git
cd Arch
npm install
npm run dev
```

Frontend only:

```bash
npm run dev:vite
```

Backend only:

```bash
npm run dev:server
```

Validation:

```bash
npm run lint
npm run build
```

### 9.3 Deploy setup (Netlify + Render)

#### Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Rewrites are in `public\_redirects`:

```text
/auth/*  https://arch-a6bm.onrender.com/auth/:splat  200
/proxy/* https://arch-a6bm.onrender.com/proxy/:splat 200
/*       /index.html                                 200
```

#### Render

- Build command: `npm install`
- Start command: `node server/index.cjs`
- Required runtime env depends on selected features.

### 9.4 Environment variables (.env names only, with meanings)

| Variable | Used by | Meaning |
|---|---|---|
| `ARCH_DEV_API_COOKIES` | Vite dev proxy | Optional legacy cookie header for `/api` fallback in dev. |
| `REDIS_URL` | backend | Primary Redis connection string for sessions/subscriptions. |
| `RENDER_REDIS_URL` | backend | Alternate Redis URL fallback. |
| `SRM_TLS_INSECURE` | backend | If `1`, bypass cert validation for SRM requests only. |
| `WEB_PUSH_PUBLIC_KEY` | backend | VAPID public key for browser subscription flow. |
| `WEB_PUSH_PRIVATE_KEY` | backend | VAPID private key for push sending (future worker). |
| `WEB_PUSH_SUBJECT` | backend | Contact URI for VAPID metadata. |
| `ADMIN_USER` | backend | Admin identity allowed for metrics (`as6977` default). |
| `ADMIN_METRICS_TOKEN` | backend | Required token for header-based admin metrics endpoint. |
| `PORT` | backend | Express listen port (defaults to `3001` locally; Render injects its own). |
| `NODE_ENV` | backend/build | Runtime mode. |

### 9.5 Important config files and key fields

#### `vite.config.ts`

- `server.proxy`:
  - `/auth` and `/proxy` -> `http://localhost:3001` in dev.
  - `/api` fallback to SRM route for legacy testing.
- `build.rollupOptions.output.manualChunks`:
  - `motion-vendor`
  - `charts-vendor`
- `VitePWA`:
  - `registerType: autoUpdate`
  - Manifest metadata and icons
  - Workbox runtime caching policy.

#### `tsconfig.app.json`

- `resolveJsonModule: true` for changelog JSON import.
- `strict: true` and no emit in bundler mode.

#### `tsconfig.node.json`

- Node-targeted TS settings for Vite config type-checking.

#### `eslint.config.js`

- Flat config using:
  - `@eslint/js` recommended
  - `typescript-eslint` recommended
  - react hooks + react refresh rules
- Ignores `dist`, `dev-dist`.

#### `index.html`

- Includes viewport fit for safe-area support.
- Includes startup self-heal script that unregisters SW/caches and reloads once if shell does not mount.

#### `public\404.html`

- Static fallback page for direct hosting route misses.

---

## 10. KEY DECISIONS AND DESIGN RATIONALE

1. **Dedicated backend auth/proxy instead of direct browser calls**
   - Needed for cookie-jar controlled Zoho/SRM auth and session management.
   - Trade-off: additional backend maintenance.

2. **Opaque session token model**
   - Browser holds token, backend maps to cookieString session.
   - Trade-off: backend storage requirement.

3. **Redis optional but preferred**
   - Solves session loss across restarts.
   - Trade-off: operational complexity and env management.

4. **Scoped TLS fallback (`SRM_TLS_INSECURE`)**
   - Better than global TLS disable.
   - Trade-off: still insecure when enabled; should be temporary.

5. **Auth drift detection by HTML signature**
   - Upstream can return login pages with status `200`.
   - Trade-off: signature matching can require updates if upstream login HTML changes.

6. **Adaptive polling strategy**
   - Frequent polling only during active class windows, relaxed otherwise.
   - Trade-off: more logic complexity but lower resource usage.

7. **Per-user local cache with schema versioning and TTL**
   - Fast reopen and stale-data control.
   - Trade-off: cache management complexity.

8. **Strict batch fallback rules**
   - Avoid wrong timetable defaults for unknown batches.
   - Trade-off: unknown cases may show empty until parsed data is available.

9. **Header-driven attendance parser**
   - More resilient than fixed column index parser.
   - Trade-off: still sensitive to severe upstream schema changes.

10. **Practical slot override from timetable metadata**
    - Solves `LAB` generic slot mismatch.
    - Trade-off: depends on metadata parse success.

11. **Admin metrics access control**
    - Protected endpoints and admin identity restrictions.
    - Trade-off: no public observability endpoint for non-admin users.

12. **Changelog externalized to JSON**
    - Content updates without component code edits.
    - Trade-off: requires schema validation in runtime normalization.

13. **Cooking screen as dedicated page**
    - Cleaner profile UX and better release-note readability.
    - Trade-off: extra navigation step.

14. **Push controls integrated under attendance alerts**
    - Cleaner user surface.
    - Trade-off: less explicit user-facing push diagnostics.

---

## 11. GOTCHAS, WARNINGS, AND IMPORTANT NOTES

1. `.gitignore` ignores root `*.md` except `README.md`.
   - `updated-till-now.md` will be ignored by default unless ignore rules change.

2. Session persistence behavior depends on backend store:
   - Memory store loses sessions on restart.
   - Redis store persists.

3. Free-tier host sleep can still degrade UX even with good code.

4. Upstream HTML parser fragility is real.
   - Any SRM markup change can break extraction logic.

5. Practical mapping now relies on course code + inferred type key (`code|type`).
   - If type inference fails upstream, practical matching can regress.

6. `ADMIN_USER` handling:
   - Supports either full email or local-part matching logic.

7. Notifications:
   - In-app notification updates require permission and standalone mode logic for attendance update alerts.
   - Full closed-app push is not complete yet.

8. Cache cleanup:
   - `TAB_CACHE_VERSION` changes force old cache invalidation.
   - This is intentional when schema changes.

9. Security:
   - Any shared credentials used during debugging should be rotated.
   - Never commit secrets.

10. HAR file expectation:
    - The file referenced by user (`academia.srmist.edu.in.har`) was not present in this workspace at audit time.

---

## 12. EXTERNAL DEPENDENCIES AND INTEGRATIONS

| Integration | Purpose in this project | How called | Credentials/config needed | Constraints |
|---|---|---|---|---|
| `academia.srmist.edu.in` | Source portal data (attendance, timetable, planner, notifications) | Backend auth flow + `/proxy/*` upstream GET | Valid SRM user credentials through login flow | Upstream HTML changes can break parser assumptions |
| Zoho accounts endpoints under SRM domain | Authentication sequence and session termination gates | `server\index.cjs` login steps (`signin`, `lookup`, `password`, session termination) | Same SRM credentials and cookie handling | Can return soft-failure states via body with HTTP 200 |
| Redis Cloud / Redis server | Session and push subscription persistence | `redis` client in backend | `REDIS_URL` or `RENDER_REDIS_URL` | TLS URL formatting must be correct |
| Render | Backend hosting | Start command `node server/index.cjs` | Environment vars, service config | Free tier sleep/restarts affect continuity |
| Netlify | Frontend hosting + rewrites | Static build deploy + `_redirects` | Link to Render backend URL for `/auth` and `/proxy` | Rewrite correctness required for auth/proxy |
| Browser Service Worker + Push APIs | PWA install/cache/update and push enrollment | Frontend + generated SW endpoints | VAPID keys for push subscription APIs | Full sender worker pipeline still pending |
| GitHub | Source control and branch workflow | `main`, `canary`, feature branches | Valid git identity (noreply preferred for privacy) | Push can fail with GH007 if private email exposed |

---

## Appendix A: Key runtime/log snippets

### Redis misconfiguration error

```text
[session-store] Redis error: ... tls_get_more_records:packet length too long
```

### Redis connected on deploy

```text
[session-store] Redis session store connected.
Academia auth server running on http://0.0.0.0:10000
```

### Health endpoint showing Redis store

```json
{"ok":true,"sessions":0,"users":0,"pushSubscriptions":0,"store":"redis"}
```

### Current branch state

```text
canary 3c3b402 [origin/canary] fix: map practical slots from timetable metadata
* main 3c3b402 [origin/main] fix: map practical slots from timetable metadata
```

---

## Appendix B: Important code locations (line references)

- `src\App.tsx`
  - Cache payload/version: `329-345`
  - Batch fallback helpers: `424-453`
  - Student merge: `716-737`
  - Course slot overrides: `788-801`
  - Cooking screen: `2471-2527`
  - Push enrollment flow: `2686-2733`
  - Profile hydration: `2863-2893`
  - Attendance sync and day-order + class update pipeline: `3035-3097`
  - Login gate and cache restore: `3193-3227`

- `src\lib\api.ts`
  - Attendance page parser: `86+`
  - Timetable metadata parser (`slotByCourseKey`): `552-599`
  - Timetable+profile fetch and fallback logic: `682-718`
  - Calendar event fetch: `814-840`
  - Day-order class mapping: `845-905`
  - Push/admin APIs: `1002-1092`

- `server\index.cjs`
  - Store/env constants: `24-43`
  - Redis init and session persistence helpers: `182-272`
  - Auth drift detection: `293-306`
  - Login route: `493+`
  - Proxy route and auth-drift enforcement: `879-939`
  - Admin metrics endpoints: `942-986`
  - Health endpoint: `989-1003`

---

## Appendix C: Uncertainty declarations

1. The requested HAR file is not present in the repository at this audit point; analysis relied on code + git + prior live debugging logs.
2. Some historical command invocations from earlier conversational turns were reconstructed from outcomes and commit evidence rather than preserved shell history.
3. `dist` and `dev-dist` are generated artifacts; hashes and bundle names can change per build.

---

## 13. SESSION ADDENDUM (LATEST WORK COMPLETED AFTER THIS DOC WAS FIRST WRITTEN)

This section captures **all additional implementation/debugging work completed after the main body above**, and should be treated as authoritative for current WIP state.

### 13.1 Why this addendum exists

After the first pass of `updated-till-now.md`, substantial live debugging and UI hardening work continued, mainly around:

- predictor FAB / quick-menu overlap regressions,
- transient/mobile blank-start states,
- startup recovery behavior,
- and attendance overall percentage first-frame flicker.

### 13.2 Chronological log of latest work (post-initial doc)

1. Reproduced predictor/UI regressions in mobile viewport using Playwright MCP on live dev server.
2. Audited and repaired broken `src/index.css` state where a previous patch had displaced unrelated style blocks.
3. Restored missing quick-menu style surfaces and predictor styles together.
4. Fixed `src/App.tsx` syntax break in predictor FAB class template string (malformed backtick sequence).
5. Resolved CSS syntax warning (unbalanced `@media (max-width: 420px)` block).
6. Implemented predictor/quick-menu spacing logic using `.prediction-fab.quick-open`.
7. Refined predictor open-state behavior to morph into centered circular close button (`42x42`, hidden label).
8. Added explicit startup resilience fallback in `src/main.tsx`:
   - one-time cache+SW recovery,
   - then render a visible failure card with action buttons instead of silent failure.
9. Added preboot shell + startup timeout recovery layer in `index.html`:
   - preboot loader UI (no empty gray/black frame),
   - timeout handoff to recovery card (`Reload` / `Clear cache + reload`) if mount stalls.
10. Hardened fallback code for browser compatibility by replacing `replaceAll()` usage in inline script with regex-based replacements.
11. Fixed attendance overall percentage misleading early frame by improving `useCountUp` behavior.
12. Re-validated repeatedly on mobile (`390x844`) and current running dev server URLs.

### 13.3 Exact files changed in this latest continuation

#### `src/App.tsx`

- Fixed malformed predictor FAB className interpolation near predictor button render.
- `AttendanceScreen` receives/uses `quickMenuOpen` state for FAB offset logic.
- Updated `useCountUp`:
  - avoid misleading low first-frame values on initial hydration,
  - animate from prior value for genuine transitions,
  - keep lint-safe effect behavior.

#### `src/index.css`

- Fixed unbalanced media query brace at file tail.
- Added/normalized predictor quick-menu collision offset:
  - `.prediction-fab.quick-open` with larger bottom offset.
- Added predictor open-shape rules:
  - `.prediction-fab.open { width: 42px; height: 42px; padding: 0; border-radius: 999px; }`
- Ensured label/icon transitions preserve compact Apple-like pill→circle interaction.
- Removed duplicate/stray `.prediction-fab.quick-open` block that created inconsistent behavior.

#### `src/main.tsx`

- Added bootstrap fallback renderer (`renderBootstrapFallback`) so repeat startup failures show visible actionable UI.
- Preserved existing one-time recovery behavior but prevents silent dead-end on repeated mount failure.

#### `index.html`

- Added inline preboot shell UI (styles + markup) under `#root`:
  - `Loading Arch` / `Preparing your student portal…` card.
- Added startup timeout watchdog:
  - detects whether meaningful mount occurred (`.app`, `.login-screen`, `.not-found-screen`, fallback screens),
  - if not, swaps preboot to explicit recovery card.
- Added recovery card actions:
  - reload
  - clear SW/cache + reload
- Adjusted timeout behavior to direct fallback handoff (avoid hidden loops).

### 13.4 Validation evidence from latest work

All checks run multiple times during this continuation:

- `npm run lint` ✅
- `npm run build` ✅
- Playwright mobile viewport checks (`390x844`) ✅

Representative generated artifacts/screenshots:

- `mobile-predictor-quickmenu-final.png`
- `mobile-predictor-open-shape-check.png`
- `mobile-attendance-overall-after-countup-fix.png`
- `mobile-final-state-after-blank-fix.png`
- `network-preboot-5173-final.png`
- `network-fallback-direct-final.png`
- `network-recovery-final-5173.png`

Behavior-confirmation tests executed:

- Normal startup:
  - preboot appears briefly, then transitions to app/login surface.
- Simulated startup failure (blocking `src/main.tsx`):
  - preboot handoff correctly switches to recovery card (`Arch is taking too long to start`).

### 13.5 Current runtime interpretation (supersedes older wording above where conflicting)

- When unauthenticated, landing on login screen with dark theme is expected.
- A fully blank page should no longer persist:
  - users now see either preboot loader (short-lived) or recovery card (if mount stalls).
- Predictor FAB now has deterministic compact behavior:
  - avoids quick-menu overlap in tested mobile scenarios,
  - opens as circular close button with improved alignment.
- Early misleading attendance overall values caused by first-frame count-up have been removed.

### 13.6 Known remaining caveats

- Upstream proxy endpoints can still emit `401/502` depending on auth/session/upstream availability; this is not the same as blank UI.
- Login-screen-only view on network URL is expected for non-authenticated state and not a render failure.
- There are additional unrelated working-tree modifications present in repository (outside this addendum’s direct edits), but this addendum documents all work completed in this specific continuation.

### 13.7 Task tracking status

- Session SQL todo `mobile-blank-screen-debug` moved to `done`.
- Current SQL summary at close of this pass: `201 done / 201 total`.

