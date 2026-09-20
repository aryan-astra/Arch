# Arch — Hosting Migration Plan

**Target stack (fully free / student-tier):**

| Layer | Service | Cost | Why |
|---|---|---|---|
| Static frontend | Cloudflare Pages | Free, unlimited bandwidth | Edge cache, zero cold start |
| Academia proxy | Cloudflare Workers | 100k req/day free | <50 ms anywhere, no sleep |
| Session/KV store | Workers KV | 100k reads/day free | Replaces Render Redis |
| Database (optional) | Supabase | 500 MB free | Already configured |
| Domain | GitHub Student Pack `.me` | Free 1 yr | Branded, short |
| Push notifications | VAPID + Workers | Free | No SaaS dependency |

## Current pain (May 2026)

- **Render free-tier dynos sleep after 15 min** → first request after idle takes 20–45 s.
- `public/_redirects` already routes `/auth/*` and `/proxy/*` to `https://arch-a6bm.onrender.com` — a single line change moves them to a Worker URL once auth is ported.
- HAR files at the repo root (`updated.academia.srmist.edu.in.har`) contain plaintext credentials. **Already gitignored**; verify they are not in the working tree before deploy.

## Phase plan

### 1. Deploy frontend to Cloudflare Pages (zero risk; runs alongside Netlify)

1. `wrangler pages project create arch-frontend`
2. `wrangler pages deploy dist --project-name=arch-frontend` after `npm run build`.
3. Pages picks up `public/_redirects` as-is.
4. Test at `arch-frontend.pages.dev`. If green, point custom domain.

### 2. Stand up the Worker (parallel; auth still on Render)

Scaffolded in `worker/`. Currently exposes `/auth/health`. Port the IAM flow:

- `loginToAcademia(email, password)` — CSRF extract → IAM POST → SRM redirect → cookie grab.
- `proxyPage(slug, cookies)` — pass-through with redirect follow.
- Use Workers KV with TTL = 180 d (trusted) or 2 d (browser).

### 3. Cut over `/auth/*` and `/proxy/*` to the Worker

Edit `public/_redirects`:

```diff
- /auth/* https://arch-a6bm.onrender.com/auth/:splat 200
- /proxy/* https://arch-a6bm.onrender.com/proxy/:splat 200
+ /auth/* https://arch-academia-proxy.<account>.workers.dev/auth/:splat 200
+ /proxy/* https://arch-academia-proxy.<account>.workers.dev/proxy/:splat 200
```

Keep the Render dyno warm as a fallback for the first month (route `/auth/legacy/*` there).

### 4. Custom `.me` domain (GitHub Student Pack → Namecheap)

1. Claim free `.me` at https://education.github.com/pack → Namecheap.
2. Add domain to Cloudflare account (nameservers from CF dashboard).
3. Bind Pages: `wrangler pages deployment domain add arch.me --project=arch-frontend`.
4. Bind Worker: routes `arch.me/auth/*` → `arch-academia-proxy`.

### 5. Push notifications

Already wired via `web-push` in `server/index.cjs`. Port to Worker:

- VAPID keys live as Worker secrets (`wrangler secret put WEB_PUSH_PRIVATE_KEY`).
- Subscriptions in KV (`push:<email>` → JSON subscription object).
- Cron Triggers for scheduled attendance checks (replaces the in-process polling).

## Rollback

Each phase is independently reversible:

- Pages cutover: change DNS back to Netlify.
- Worker cutover: revert the two lines in `_redirects` to point at Render.
- DNS: 5-min TTL during migration; bump to 1 h after a week of green.

## Open decisions

- iOS gyro permission UX: prompt once via dismissible toast after login (Option A).
- QR URL scheme: `https://arch.app/u/<localpart>` (Option B — universal link).
- HAR file purge from working tree before deploy: pending user confirmation.

## Verification before deploy

```bash
# 1. PII scan
node scripts/scan-pii.js

# 2. Confirm HAR not tracked
git ls-files | findstr .har    # must be empty

# 3. Build + lint
npm run build
npm run lint

# 4. Worker typecheck
cd worker && npm run typecheck
```
