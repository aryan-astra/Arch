<div align="center">
  <img src="src/assets/final-arch-logo.svg" alt="Arch logo" width="128" />
  <h1>Arch</h1>
  <p><strong>Fast, compact, mobile-first remake of SRM Academia</strong></p>
</div>

<div align="center">
  <img alt="Build" src="https://img.shields.io/badge/build-passing-111111?style=for-the-badge&logo=githubactions&logoColor=white" />
  <img alt="Lint" src="https://img.shields.io/badge/lint-passing-1f1f1f?style=for-the-badge&logo=eslint&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/react-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/vite-7.3-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="PWA" src="https://img.shields.io/badge/pwa-enabled-0A0A0A?style=for-the-badge&logo=pwa&logoColor=white" />
</div>

## Why Arch is better for daily use

Arch is built to outperform the legacy portal experience on mobile.  
The focus is fast access, fewer taps, higher information density, and stronger session reliability.

- Mobile-first interaction model with compact layouts that reduce scrolling and navigation friction.
- Real login and data pipeline (`/auth`, `/proxy`) with trusted-session handling and automatic session validation.
- Actionable attendance UX: risk visibility, leave planning, marks trend, and day-order aware timetable context.
- Installable PWA workflow with update prompts, offline resilience, and post-install attendance alert support.

## Core features

- Live attendance, internal marks, timetable, academic calendar, and full profile surfaces.
- Adaptive attendance watcher that automatically changes fetch frequency by class activity and day type.
- Attendance change notifications in installed PWA mode (present, absent, updated).
- Ten-theme appearance system with dark-first visual polish and safe-area mobile handling.
- Startup self-heal path for stale cache/service-worker edge cases.

## Latest sanitized screenshots

> Email-like identifiers are intentionally blurred.

| Home | Attendance | Mobile home |
| --- | --- | --- |
| <img src="public/readme/home-page-sanitized.png" alt="Arch home screenshot" width="300" /> | <img src="public/readme/attendance-page-sanitized.png" alt="Arch attendance screenshot" width="300" /> | <img src="public/readme/mobile-home-sanitized.png" alt="Arch mobile home screenshot" width="260" /> |

## Quick start

```bash
npm install
npm run dev
```

Useful scripts:

- `npm run dev` → backend + frontend
- `npm run dev:vite` → frontend only
- `npm run build` → production build
- `npm run lint` → eslint checks

## Core stack

- Frontend: React + TypeScript + Vite + Framer Motion
- Backend: Express + Axios cookie-jar auth proxy
- PWA: `vite-plugin-pwa`

## Speed and performance engineering

- Adaptive polling strategy:
  - active class: 20s
  - between classes: 60s
  - off-hours: 7m
  - idle day (no class windows): 15m
  - weekend: 25m
  - hidden tab safety floor: 3m
- Heavy chart surface is lazy-loaded so first render stays fast.
- Workbox runtime caching keeps documents, assets, and media responsive under unstable networks.
- Day-order refresh is throttled and decoupled from every attendance request.
- PWA startup recovery clears broken stale cache states to avoid blank-shell regressions.

