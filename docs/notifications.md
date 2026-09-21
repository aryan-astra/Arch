# Notifications — diagnosis and target design

> Diagnosed 2026-09-21 from `src/App.tsx` (~lines 3420–3545),
> `server/index.cjs` push endpoints, and the Workbox setup. No behavior
> changed — delivery cannot be tested without VAPID keys + devices.

## What works today

- Foreground attendance-delta detection (snapshot diff per course) with
  `serviceWorker.showNotification()` fallback to `new Notification()`.
- Icon/badge use `/pwa-192.png` (Arch mark renders where platforms allow).
- Permission UX is state-aware (granted/denied/unsupported); foreground
  alerts are gated on standalone PWA display mode.
- Push subscription is enrolled via `PushManager.subscribe` and persisted
  server-side (Redis or memory).

## Why closed-app delivery is impossible today (root causes, not one line)

1. **No sender.** `web-push` is not a dependency; no code path ever encrypts
   or transmits a push message. Subscription storage is write-only.
2. **Email-keyed subscriptions.** `arch:push:subscription:<email>` holds ONE
   subscription per account — a second device silently overwrites the first.
   Multi-device requires the device-keyed model (migration
   `push_subscriptions` uses `endpoint` PK + `account_id` + `device_label`).
3. **No subscription lifecycle.** No renewal on expiry, no cleanup on
   unsubscribe/permission-revoke, no per-subscription failure tracking.
4. **No click handling.** The generated Workbox SW has no
   `notificationclick` handler, so taps cannot deep-link (e.g. to the
   affected course).
5. **No event ledger.** Nothing records generated/queued/sent/failed —
   failures are invisible (migration adds `notification_events`).

## Platform limits (do not promise universally)

- iOS/iPadOS: push needs installed PWA + explicit permission; background
  refresh is throttled by the OS. Foreground sync on app open is the
  reliable path — the app already freshness-checks on reopen.
- Android/Chrome: full push supported once a sender exists.
- Browsers may throttle timers: never claim exact 30 s background cadence.

## Target (phases 7/11)

Device-keyed subscriptions → server-side attendance-diff worker (cron or
sync-triggered) → VAPID send via `web-push` (new dep, server-only) →
`notification_events` ledger with retry states → custom SW push/click
handlers (requires moving from `generateSW` to `injectManifest`, carefully —
must not regress offline caching) → icon verified per platform.

Do NOT implement the sender until VAPID keys exist in the deployment
environment and the device-keyed migration is applied.
