<div align="center">
  <img src="src/assets/final-arch-logo.svg" alt="Arch logo" width="116" />
  <h1>Arch</h1>
  <p><strong>Mobile-first SRM Academia companion with faster UX, stable sessions, and installable PWA flow.</strong></p>
</div>

<div align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Vite 7" src="https://img.shields.io/badge/Vite-7.3-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img alt="PWA Enabled" src="https://img.shields.io/badge/PWA-enabled-111111?style=flat-square&logo=pwa&logoColor=white" />
  <img alt="Branch Flow" src="https://img.shields.io/badge/flow-feature_%E2%86%92_canary_%E2%86%92_main-0f172a?style=flat-square" />
  <img alt="Status Active" src="https://img.shields.io/badge/status-active-16a34a?style=flat-square" />
</div>

---

## What Arch is

Arch is a compact, high-density remake of the SRM Academia experience.  
It is designed for daily student usage where speed, glanceability, and session reliability matter more than desktop-style layouts.

It provides one place for:
- attendance tracking and risk visibility
- internals/marks trend checks
- timetable + day-order context
- profile and account surfaces
- installable PWA behavior with startup recovery protections

---

## Why this exists

The legacy flow is functional but high-friction on mobile. Arch reduces that friction through:

1. **Fewer taps** and more action-focused screens.
2. **Stronger session handling** with trusted-device persistence rules.
3. **Adaptive polling** so live data feels fresh without burning battery/network.
4. **PWA reliability** (update prompt, runtime caching, startup self-heal path).

---

## Feature map

| Area | What you get |
|---|---|
| Authentication | Real login flow through backend proxy (`/auth/*`) and protected upstream proxy (`/proxy/*`) |
| Attendance | Live aggregates, subject-level status, leave-planning/prediction helpers |
| Timetable | Day-order aware schedule + batch-safe fallback logic |
| Marks | Compact trend visuals and per-course progress |
| Notifications | Attendance delta checks and installable-app notification integration |
| Profile/Admin | Session info, user details, admin metrics surface for configured admin user |
| Theme system | Dark-first polished UI with multiple theme tones |

---

## Screenshots

> Data in screenshots is sanitized.

| Home | Attendance | Mobile Home |
|---|---|---|
| <img src="public/readme/home-page-sanitized.png" alt="Home screen" width="300" /> | <img src="public/readme/attendance-page-sanitized.png" alt="Attendance screen" width="300" /> | <img src="public/readme/mobile-home-sanitized.png" alt="Mobile home screen" width="250" /> |

---

## Architecture (high level)

```text
Browser (React + Vite PWA)
  ├─ /auth/*  ────────────────┐
  └─ /proxy/* ────────────────┤
                               v
                    Node/Express Backend (server/index.cjs)
                      ├─ Session store (Redis if configured, else memory)
                      ├─ Login/session validation endpoints
                      ├─ Authenticated upstream proxy
                      └─ Admin + push subscription endpoints
                               |
                               v
                        SRM/Zoho upstream services
```

---

## Tech stack

### Frontend
- **React 19**
- **TypeScript 5.9**
- **Vite 7**
- **Framer Motion** for interaction polish
- **Recharts** for graph rendering
- **vite-plugin-pwa** for service worker + manifest integration

### Backend
- **Express 5**
- **Axios + axios-cookiejar-support + tough-cookie** for authenticated upstream session handling
- **Redis** (optional but recommended) for persistent sessions

---

## Local setup

### Prerequisites
- Node.js 20+ recommended
- npm 10+ recommended

### Install

```bash
npm install
```

### Run

```bash
# frontend + backend together
npm run dev

# frontend only
npm run dev:vite

# backend only
npm run dev:server
```

### Quality checks

```bash
npm run lint
npm run build
npm run preview
```

---

## Environment variables

Create `.env` for local backend/runtime configuration.

| Variable | Required | Purpose |
|---|---|---|
| `REDIS_URL` | Recommended | Enables persistent session store and better login continuity |
| `RENDER_REDIS_URL` | Optional | Alternate Redis env key supported by backend |
| `SRM_TLS_INSECURE` | Optional | Set to `1` only when TLS chain issues require insecure upstream TLS mode |
| `ADMIN_USER` | Optional | Username allowed to access admin self-metrics |
| `ADMIN_METRICS_TOKEN` | Recommended for ops | Token for header-protected admin metrics endpoint |
| `WEB_PUSH_PUBLIC_KEY` | Required for closed-app push | Public VAPID key |
| `WEB_PUSH_PRIVATE_KEY` | Required for closed-app push | Private VAPID key |
| `WEB_PUSH_SUBJECT` | Required for closed-app push | Contact URI, usually `mailto:...` |

---

## Important endpoints

### Auth/session
- `POST /auth/login`
- `GET /auth/validate`
- `POST /auth/logout`
- `DELETE /auth/sessions`

### Proxy
- `GET /proxy/*`

### Push (beta surfaces)
- `GET /auth/push/status`
- `GET /auth/push/public-key`
- `POST /auth/push/subscription`
- `DELETE /auth/push/subscription`

### Admin
- `GET /auth/admin/metrics`
- `GET /auth/admin/metrics/self`
- `GET /auth/health`

---

## Branch and release workflow

Recommended flow:

1. Build features on `feature/*`
2. Merge into `canary` for integration/staging checks
3. Promote to `main` for production

Production rule of thumb:
- `canary` should stay integration-clean
- `main` should stay deploy-clean
- run lint + build before each promotion

---

## Deployment notes

- Frontend is optimized for static hosting (Netlify-style setup via `public/_redirects`).
- Backend is designed for Render-style Node hosting with optional Redis.
- For best uptime and fewer session drops, use always-on backend + Redis.

---

## Developer notes

- Keep startup resilience intact (`index.html` preboot shell + `src/main.tsx` recovery path).
- Keep adaptive polling strategy intact unless intentionally reworked.
- Avoid broad cache/storage resets; prefer namespaced cleanup behavior.
- Preserve auth reason-code contract between backend and frontend.

