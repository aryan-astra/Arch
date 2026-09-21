-- Canonical Arch academic model (v1).
--
-- One Arch account = exactly one SRM student identity (enforced by UNIQUE on
-- arch_accounts.srm_email). History is insert-only: attendance/marks rows are
-- never UPDATEd by syncs — new retrievals insert new rows and snapshots point
-- at what was current. Raw source strings are preserved alongside numerics.
--
-- NOT APPLIED to any remote yet. Apply only after `supabase link` against a
-- dev project and review. RLS is enabled everywhere; app access goes through
-- the backend with the service key (no permissive anon policies by design).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- accounts
create table if not exists public.arch_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  srm_email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- academics
create table if not exists public.academic_terms (
  id text primary key,
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  academic_year text not null,
  semester integer not null,
  label text not null,
  unique (account_id, academic_year, semester)
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  code text not null,
  title text not null default '',
  kind text not null default 'theory'
    check (kind in ('theory', 'practical', 'project', 'other')),
  credits numeric(5,2) not null default 0,
  unique (account_id, code)
);

create table if not exists public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  term_id text not null references public.academic_terms(id) on delete cascade,
  faculty text not null default '',
  slot text not null default '',
  room text not null default '',
  section text not null default '',
  unique (course_id, term_id, slot)
);
create index if not exists course_offerings_account_term_idx
  on public.course_offerings(account_id, term_id);

-- Attendance ledger (insert-only; one row per retrieval, never updated).
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  source text not null check (source in ('academia', 'student-portal', 'community', 'arch')),
  conducted_raw text not null default '',
  conducted numeric,
  absent_raw text not null default '',
  absent numeric,
  percent_raw text not null default '',
  percent numeric,
  retrieved_at timestamptz not null default now(),
  parser_version text not null default ''
);
create index if not exists attendance_records_offering_time_idx
  on public.attendance_records(offering_id, retrieved_at desc);
create index if not exists attendance_records_account_time_idx
  on public.attendance_records(account_id, retrieved_at desc);

-- Marks ledger (insert-only header + components).
create table if not exists public.mark_records (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  source text not null check (source in ('academia', 'student-portal', 'community', 'arch')),
  retrieved_at timestamptz not null default now(),
  parser_version text not null default ''
);
create table if not exists public.mark_components (
  id uuid primary key default gen_random_uuid(),
  mark_id uuid not null references public.mark_records(id) on delete cascade,
  test_name text not null,
  test_number integer,
  assessment_type text not null default '',
  max_raw text not null default '',
  max_score numeric,
  scored_raw text not null default '',
  scored numeric,
  unique (mark_id, test_name)
);

-- ---------------------------------------------------------------- sync/history
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'failed'))
);

create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  captured_at timestamptz not null default now(),
  source text not null,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists snapshots_account_time_idx
  on public.snapshots(account_id, captured_at desc);

create table if not exists public.source_records (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  source text not null,
  endpoint text not null default '',
  content_hash text not null,
  retrieved_at timestamptz not null default now(),
  unique (account_id, source, content_hash)
);

create table if not exists public.conflicts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  entity text not null,
  entity_key text not null,
  academia_value text,
  portal_value text,
  academia_retrieved_at timestamptz,
  portal_retrieved_at timestamptz,
  canonical_choice text not null check (canonical_choice in ('academia', 'student-portal')),
  reason text not null default '',
  resolved_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- resources
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique,
  year text not null,
  unit text not null,
  subject text not null,
  course_code text,
  semester text,
  program text,
  department text,
  exam_type text,
  academic_year text,
  uploader_id uuid references public.arch_accounts(id) on delete set null,
  canonical_filename text not null,
  r2_key text,
  archive_identifier text,
  quality_score numeric(5,3),
  moderation_state text not null default 'pending'
    check (moderation_state in ('pending', 'approved', 'quarantined', 'removed')),
  access_count integer not null default 0,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists resources_subject_year_idx
  on public.resources(subject, year desc);

create table if not exists public.resource_ratings (
  resource_id uuid not null references public.resources(id) on delete cascade,
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  usefulness smallint check (usefulness between 1 and 5),
  report text not null default '',
  created_at timestamptz not null default now(),
  primary key (resource_id, account_id)
);

-- ---------------------------------------------------------------- community
create table if not exists public.community_submissions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  scope jsonb not null default '{}'::jsonb,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  state text not null default 'visible'
    check (state in ('visible', 'contested', 'quarantined', 'removed')),
  created_at timestamptz not null default now()
);

create table if not exists public.community_corrections (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.community_submissions(id) on delete cascade,
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.submission_votes (
  submission_id uuid not null references public.community_submissions(id) on delete cascade,
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (submission_id, account_id)
);

-- Reputation inputs live here; the scoring algorithm is specified separately
-- (docs/reputation-design.md) and is NOT a production dependency yet.
create table if not exists public.contributor_scores (
  account_id uuid primary key references public.arch_accounts(id) on delete cascade,
  score numeric(6,5),
  components jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- devices/push
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  device_label text not null default '',
  keys jsonb not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arch_accounts(id) on delete cascade,
  subscription_endpoint text references public.push_subscriptions(endpoint) on delete set null,
  kind text not null,
  state text not null default 'generated'
    check (state in ('generated', 'queued', 'sent', 'acknowledged', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists notification_events_account_time_idx
  on public.notification_events(account_id, created_at desc);

-- ---------------------------------------------------------------- ops
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.arch_accounts(id) on delete cascade,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_name_time_idx
  on public.analytics_events(name, created_at desc);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_account_id uuid references public.arch_accounts(id) on delete set null,
  action text not null,
  target jsonb not null default '{}'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.arch_accounts enable row level security;
alter table public.academic_terms enable row level security;
alter table public.courses enable row level security;
alter table public.course_offerings enable row level security;
alter table public.attendance_records enable row level security;
alter table public.mark_records enable row level security;
alter table public.mark_components enable row level security;
alter table public.sync_runs enable row level security;
alter table public.snapshots enable row level security;
alter table public.source_records enable row level security;
alter table public.conflicts enable row level security;
alter table public.resources enable row level security;
alter table public.resource_ratings enable row level security;
alter table public.community_submissions enable row level security;
alter table public.community_corrections enable row level security;
alter table public.submission_votes enable row level security;
alter table public.contributor_scores enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_events enable row level security;
alter table public.analytics_events enable row level security;
alter table public.admin_actions enable row level security;
-- No permissive policies: all access via backend service key until Supabase
-- Auth is integrated. Add least-privilege policies only with a migration.
