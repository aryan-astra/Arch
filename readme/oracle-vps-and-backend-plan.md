# Arch — Oracle Cloud Free Tier + Backend & Analytics Plan

> Status: Planning document (no infra changes have been made).
> Audience: Solo maintainer of Arch (SRM student portal clone).
> Cost target: ₹0 / month.

---

## 1. Why Oracle Cloud Always Free?

Oracle Cloud Infrastructure (OCI) is the **only major cloud** with a genuinely permanent free tier that's beefy enough to host an app like Arch end-to-end:

| Resource | Always Free Allowance |
|---|---|
| Compute — Ampere A1 (ARM) | **4 OCPU + 24 GB RAM** total, split across up to 4 VMs |
| Compute — AMD VM.Standard.E2.1.Micro | 2× VMs (1/8 OCPU + 1 GB RAM each) |
| Block storage | 200 GB total |
| Object Storage | 20 GB |
| Outbound data transfer | 10 TB / month |
| Load Balancer | 1× 10 Mbps flexible LB |
| Autonomous DB | 2× 20 GB |
| Monitoring + Logging | included |

**Recommendation:** Provision **one Ampere A1 VM with 4 OCPU / 24 GB RAM / 100 GB disk** running Ubuntu 24.04. That single machine will easily run:

- The Arch auth proxy (`server/index.cjs`)
- Self-hosted Supabase (Postgres + Auth + Storage + Realtime)
- A reverse proxy (Caddy)
- Umami analytics
- Uptime Kuma
- ...and still have headroom.

### Caveats / known gotchas

- ARM (Ampere) capacity in Mumbai/Hyderabad is contested. If you can't provision a 4-OCPU shape immediately, **start with 1 OCPU / 6 GB** and resize later, or fall back to a 2× AMD micro setup.
- Oracle deletes "idle" Always Free tenants after 7 days of inactivity. Mitigate by keeping a workload running (anything on the VM counts).
- A credit card is required for signup (₹0 hold, no charge).

---

## 2. Signup & VM bootstrap — step by step

### 2.1 Account creation

1. Go to <https://www.oracle.com/cloud/free/> → "Start for free".
2. Use a personal email (not the SRM one — SRM mail often blocks Oracle's verification).
3. **Home region:** pick `India South (Hyderabad)` or `India West (Mumbai)`. **This cannot be changed later.** Mumbai has historically better A1 availability.
4. Verify phone + card. Choose **Pay As You Go is OFF** — stays "Always Free" only.

### 2.2 Networking (VCN)

1. **Networking → Virtual Cloud Networks → Start VCN Wizard → "VCN with Internet Connectivity"**.
2. Default CIDR is fine (`10.0.0.0/16`).
3. After creation, open the public subnet's Security List and add ingress rules:
   - TCP `22` from your home IP only (SSH).
   - TCP `80` from `0.0.0.0/0` (HTTP — for Let's Encrypt).
   - TCP `443` from `0.0.0.0/0` (HTTPS).
   - (Optional) TCP `3000` for direct Umami access during setup, then remove.

### 2.3 SSH key

On your Windows machine (PowerShell):
```powershell
ssh-keygen -t ed25519 -C "arch-oracle" -f $env:USERPROFILE\.ssh\arch_oracle
```
Use the `.pub` content in the Oracle instance form.

### 2.4 Create the instance

1. **Compute → Instances → Create instance**.
2. Name: `arch-prod`.
3. Image: **Canonical Ubuntu 24.04 (aarch64)**.
4. Shape: **VM.Standard.A1.Flex** → set 4 OCPU, 24 GB.
5. VCN: the one you created. **Assign public IPv4**.
6. SSH keys: paste `arch_oracle.pub`.
7. Boot volume: 100 GB.
8. Create.

### 2.5 First-boot hardening (cloud-init or first SSH)

```bash
ssh -i ~/.ssh/arch_oracle ubuntu@<PUBLIC_IP>

# Update + essentials
sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban git curl unzip

# Firewall (Oracle's Security List is enough, but UFW is belt-and-braces)
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw --force enable

# Open Oracle's iptables (Ubuntu image ships with restrictive defaults!)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save   # if not installed: sudo apt -y install iptables-persistent

# Disable password SSH
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Add a non-root user (optional — `ubuntu` already works)
```

### 2.6 Install Docker + Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker
docker compose version    # plugin ships with modern Docker
```

### 2.7 Domain + Caddy (free TLS)

- Buy a cheap domain (`arch.<you>.in` from Namecheap / Porkbun / Cloudflare Registrar — ~₹500/yr) **OR** use a free subdomain (`duckdns.org`, `is-a.dev`).
- Point an `A` record at the VM's public IP.
- **(Recommended) Front with Cloudflare proxy** (orange-cloud icon): hides Oracle IP, free DDoS, free analytics.

`/srv/arch/Caddyfile`:
```caddyfile
arch.example.com {
    reverse_proxy localhost:3001        # Arch auth proxy
}

api.arch.example.com {
    reverse_proxy localhost:8000        # Supabase Kong gateway
}

analytics.arch.example.com {
    reverse_proxy localhost:3001 {
        # umami
    }
}
```

Run Caddy via Docker:
```yaml
# /srv/arch/docker-compose.caddy.yml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    network_mode: host
volumes:
  caddy_data:
  caddy_config:
```

---

## 3. Database: **Supabase self-hosted** vs. plain Postgres vs. SQLite

### TL;DR
**Use self-hosted Supabase.** You already speak that dialect in Arch (`supabase/migrations/`), you get free auth/realtime/storage, and 24 GB RAM is more than enough.

### Comparison

| Concern | Supabase self-hosted | Bare Postgres + custom Node | SQLite (litefs/turso) |
|---|---|---|---|
| Setup | `git clone supabase/supabase && docker compose up` | hand-roll | trivial |
| RAM footprint | ~1.8 GB idle | ~150 MB | <50 MB |
| Auth / RLS | included | DIY | DIY |
| Realtime subscriptions | included | DIY (socket.io) | DIY |
| Storage (avatars, etc.) | included (S3-compatible) | DIY | DIY |
| Existing Arch fit | ✅ migration file already exists | needs rewriting | doesn't fit JSON-heavy schema well |
| Multi-device sync | ✅ trivial | DIY | hard |
| Backups | `pg_dump` cron → OCI Object Storage | same | file copy |

### Supabase deploy snippet

```bash
cd /srv/arch
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# EDIT .env — set strong POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32),
# ANON_KEY/SERVICE_ROLE_KEY (generate via https://supabase.com/docs/guides/self-hosting),
# SITE_URL=https://arch.example.com
docker compose up -d
```

Then point Arch's frontend at `https://api.arch.example.com` for `SUPABASE_URL` and inject the anon key at build time via `.env.production`.

### Schema sketch (additions on top of the existing migration)

```sql
-- profiles already exist (synced with auth.users)

create table public.attendance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  captured_at timestamptz default now(),
  overall_pct numeric(5,2),
  courses jsonb,                      -- full payload from Academia
  source text default 'sync'          -- sync | refresh | autorelogin
);
create index on public.attendance_snapshots (user_id, captured_at desc);

create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete set null,
  event_type text not null,           -- 'login', 'refresh', 'screen_view', 'error', ...
  payload jsonb,
  ts timestamptz default now()
);
create index on public.events (event_type, ts desc);
create index on public.events (user_id, ts desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  endpoint text unique not null,
  keys jsonb not null,                -- {p256dh, auth}
  created_at timestamptz default now()
);

-- Row-level security (always on)
alter table public.attendance_snapshots enable row level security;
alter table public.events               enable row level security;
alter table public.push_subscriptions   enable row level security;

create policy "users see their own" on public.attendance_snapshots
  for all using (auth.uid() = user_id);
create policy "users see their own" on public.events
  for all using (auth.uid() = user_id);
create policy "users see their own" on public.push_subscriptions
  for all using (auth.uid() = user_id);
```

### Credentials storage — server-side option

> User said security isn't a concern and consent is given. Still — minimize blast radius.

- **Don't store the plaintext SRM password on the server.** Even with consent, one breach = thousands of compromised NetIDs and you become liable to SRM IT.
- The current WebCrypto vault (`src/lib/credentials.ts`) keeps the ciphertext on the device. The browser holds the unwrap key in IndexedDB, server never sees either. **Keep this design.**
- If multi-device auto-relogin is wanted later: derive the unwrap key from a user passphrase (PBKDF2 ≥ 600k iters, salted), store only the salt + ciphertext in Supabase. Server never sees the plaintext.

---

## 4. Analytics & tracking

> Everything below is **opt-in per category** in the Arch UI. Same consent pattern as the auto-relogin checkbox.

### Recommended stack

| Layer | Tool | Self-host? | RAM | Why |
|---|---|---|---|---|
| Product analytics (events, funnels, retention) | **Umami** | ✅ docker | ~80 MB | Lightest, GDPR-friendly, beautiful UI |
| Error tracking | **GlitchTip** (Sentry-compatible API) | ✅ docker | ~400 MB | Same SDK as Sentry, free forever |
| Uptime monitoring | **Uptime Kuma** | ✅ docker | ~80 MB | Pings your own /healthz + Academia upstream |
| Log aggregation | journald + `vector` → file rotation | native | ~30 MB | Skip Loki/Grafana unless you need dashboards |
| Performance (RUM) | Umami's built-in pageview timing | — | — | Adequate for a single-page app |

### What to instrument (consent-gated)

**Always (technical telemetry, no PII):**
- Service-worker install / update
- Cold start time
- API call latency histogram (proxy + Academia upstream)
- Login funnel: NetID → password → success/failure (count only)
- Auto-relogin attempts: triggered / succeeded / failed (count only)

**With explicit consent (`analytics.optIn`):**
- Screen views (Home / Attendance / Timetable / Calendar / Marks / Mess / Profile)
- Feature usage: Refresh tap, Mess tab opens, Course Feedback click-through
- Error stacktraces (sanitized — strip NetID/email)
- Session length, day-of-week distribution

**Never, regardless of consent:**
- Raw passwords
- Full attendance payloads to a 3rd party (Umami self-hosted is fine; SaaS is not)
- Anything keystroke-level

### Implementation sketch

Add a single helper:
```ts
// src/lib/analytics.ts
const ENDPOINT = import.meta.env.VITE_ANALYTICS_URL ?? '';
const optedIn = () => localStorage.getItem('analytics.optIn') === '1';

export function track(event: string, payload: Record<string, unknown> = {}) {
  if (!ENDPOINT || !optedIn()) return;
  navigator.sendBeacon(`${ENDPOINT}/api/send`, JSON.stringify({
    website: import.meta.env.VITE_UMAMI_ID,
    name: event,
    data: payload,
    url: location.pathname,
    referrer: document.referrer,
    screen: `${screen.width}x${screen.height}`,
  }));
}
```

`sendBeacon` is fire-and-forget, doesn't block navigation, doesn't fail on tab close.

Then sprinkle `track('refresh.tap')`, `track('mess.open')`, `track('autorelogin.success')`, etc.

---

## 5. Backend additions worth considering

Ordered by ROI.

1. **Web Push (PWA notifications)** — class reminders, attendance % crossing the 75% line, exam date reminders. Already have service worker (`dev-dist/sw.js`). Add VAPID keys, store subscriptions in the `push_subscriptions` table, send via `web-push` Node lib from a cron.
2. **Daily attendance snapshot cron** — every night at 23:55, server logs in via the user's encrypted vault (with their consent), writes a row to `attendance_snapshots`. Lets you draw a real trend chart instead of relying on whatever Arch saw last.
3. **Server-side block-sessions sweeper** — already partially done in `server/index.cjs`. Promote to a scheduled task: every 30 min the server kills the user's stale Zoho sessions so the 2-concurrent limit never bites.
4. **Marks delta notifications** — diff today's marks payload against yesterday's snapshot; push when a new mark appears.
5. **Public read-only timetable share** — `/u/<slug>/timetable.png` rendered server-side via @vercel/og or satori. Lets friends share schedules without exposing the NetID.
6. **Feedback inbox** — `/api/feedback` posts to a Telegram bot or Discord webhook. Free, instant, no email infra.
7. **Healthz / status page** — `/healthz` returns proxy + DB + Academia upstream status. Uptime Kuma renders the public page.
8. **Rate limiting + abuse guard** — `express-rate-limit` on `/api/login` (10/min/IP). Already cheap insurance.
9. **Audit log** — append-only `events` rows for every login, password change, consent toggle. Helps debugging and gives the user a "recent activity" view.

---

## 6. Suggested folder layout on the VPS

```
/srv/arch/
├── Caddyfile
├── docker-compose.yml            # references all stacks
├── arch-proxy/                   # this repo's server/index.cjs
│   ├── server.cjs
│   ├── package.json
│   └── Dockerfile
├── supabase/                     # cloned upstream
│   └── docker/.env
├── umami/
│   └── docker-compose.yml
├── glitchtip/
│   └── docker-compose.yml
├── uptime-kuma/
└── backups/                      # nightly pg_dump tarballs → OCI Object Storage
```

Single top-level `docker-compose.yml` with `include:` to merge them; `caddy` on host network, everything else on a shared `arch_net` bridge.

---

## 7. Migration plan from "local-only" to VPS

You can do this without touching the frontend code at all:

1. **Phase A — lift the proxy.** `scp server/index.cjs` to VPS, run under Docker. Point `VITE_API_BASE` at `https://arch.example.com`. Frontend still uses localStorage for everything else. Zero behavior change for users.
2. **Phase B — add Supabase auth (optional).** Add a "Sign in with email magic link" button next to NetID. Users who opt in get cloud sync; everyone else stays 100% local. Existing localStorage data is migrated lazily on first sync.
3. **Phase C — enable analytics opt-in** in Profile → Privacy. Surface Umami pageviews + GlitchTip errors only after the toggle is on.
4. **Phase D — push notifications + nightly snapshot cron**. By now you have the DB + auth + scheduler primitives in place.

Each phase is independently deployable, independently revertable, and never breaks the local-only flow you have today.

---

## 8. Cost summary

| Service | Monthly cost |
|---|---|
| Oracle VM (4 OCPU / 24 GB RAM) | ₹0 |
| 100 GB block storage | ₹0 |
| 10 TB egress | ₹0 |
| Cloudflare DNS + proxy | ₹0 |
| Domain (optional) | ~₹40 (~₹500/yr amortised) |
| Backups → OCI Object Storage 20 GB | ₹0 |
| **Total** | **≈ ₹40 / month** (₹0 if you use a free subdomain) |

---

## 9. Decision checklist for you

- [ ] Sign up for Oracle Cloud (use personal email, Mumbai region).
- [ ] Decide on a domain — free subdomain (`duckdns.org`) is fine to start.
- [ ] Provision the Ampere A1 VM (4 OCPU / 24 GB).
- [ ] Run the bootstrap snippet in §2.5.
- [ ] Decide: **Supabase self-hosted** (recommended) or bare Postgres.
- [ ] Lift the existing `server/index.cjs` proxy to the VPS first — defer DB until that's stable.
- [ ] Add Umami once you have ≥ 5 daily users; analytics on an empty app is just CPU burn.
- [ ] Keep the WebCrypto vault client-side. Don't ship plaintext SRM passwords to the server even with consent.

---

## 10. References

- Oracle Always Free official: <https://www.oracle.com/cloud/free/>
- Supabase self-hosting: <https://supabase.com/docs/guides/self-hosting/docker>
- Umami: <https://umami.is/docs/install>
- GlitchTip: <https://glitchtip.com/documentation/install>
- Uptime Kuma: <https://github.com/louislam/uptime-kuma>
- Caddy reverse-proxy: <https://caddyserver.com/docs/quick-starts/reverse-proxy>
- Web Push (VAPID) primer: <https://web.dev/articles/push-notifications-overview>
