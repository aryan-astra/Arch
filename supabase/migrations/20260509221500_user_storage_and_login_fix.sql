create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  email text primary key,
  name text,
  reg_no text,
  program text,
  department text,
  batch integer,
  section text,
  semester integer,
  mobile text,
  advisor_name text,
  advisor_email text,
  advisor_phone text,
  academic_advisor_name text,
  academic_advisor_email text,
  academic_advisor_phone text,
  academic_year text,
  enrollment_date text,
  raw_profile jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_snapshot_at timestamptz
);

create table if not exists public.user_legal_consents (
  email text primary key references public.user_profiles(email) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  user_agent text,
  ip_hash text
);

create table if not exists public.user_data_snapshots (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.user_profiles(email) on delete cascade,
  captured_at timestamptz not null default now(),
  source_updated_at timestamptz,
  day_order integer,
  student jsonb not null default '{}'::jsonb,
  attendance jsonb not null default '[]'::jsonb,
  marks jsonb not null default '[]'::jsonb,
  timetable_by_day jsonb not null default '{}'::jsonb,
  course_slot_overrides jsonb not null default '{}'::jsonb
);

create index if not exists user_data_snapshots_email_captured_idx
  on public.user_data_snapshots(email, captured_at desc);

create table if not exists public.user_attendance_subjects (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.user_data_snapshots(id) on delete cascade,
  email text not null references public.user_profiles(email) on delete cascade,
  course_code text not null,
  title text,
  course_type text,
  faculty text,
  slot text,
  room text,
  conducted integer not null default 0,
  absent integer not null default 0,
  percent numeric(6,2) not null default 0,
  credit numeric(6,2) not null default 0,
  category text,
  captured_at timestamptz not null default now()
);

create index if not exists user_attendance_subjects_email_course_idx
  on public.user_attendance_subjects(email, course_code, captured_at desc);

create table if not exists public.user_mark_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.user_data_snapshots(id) on delete cascade,
  email text not null references public.user_profiles(email) on delete cascade,
  course_code text not null,
  test text not null,
  max_score numeric(8,2),
  scored numeric(8,2),
  captured_at timestamptz not null default now()
);

create index if not exists user_mark_items_email_course_idx
  on public.user_mark_items(email, course_code, captured_at desc);

create table if not exists public.study_material_votes (
  file_key text not null,
  user_email text not null references public.user_profiles(email) on delete cascade,
  vote_value smallint not null default 1 check (vote_value = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (file_key, user_email)
);

create index if not exists study_material_votes_file_key_idx
  on public.study_material_votes(file_key);

create table if not exists public.study_material_share_events (
  id uuid primary key default gen_random_uuid(),
  file_key text not null,
  user_email text references public.user_profiles(email) on delete set null,
  share_target text,
  created_at timestamptz not null default now()
);

create index if not exists study_material_share_events_file_key_idx
  on public.study_material_share_events(file_key, created_at desc);

create table if not exists public.study_material_submissions (
  id uuid primary key default gen_random_uuid(),
  uploader_email text not null references public.user_profiles(email) on delete set null,
  uploader_name text,
  r2_key text not null,
  filename text not null,
  mime text,
  size bigint,
  status text not null default 'pending',
  reviewer_email text,
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists study_material_submissions_status_idx
  on public.study_material_submissions(status, created_at desc);

create table if not exists public.contributors (
  email text primary key references public.user_profiles(email) on delete cascade,
  name text,
  approved_by text,
  approved_at timestamptz
);

create table if not exists public.contributor_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  message text,
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz
);

create index if not exists contributor_applications_status_idx
  on public.contributor_applications(status, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.user_legal_consents enable row level security;
alter table public.user_data_snapshots enable row level security;
alter table public.user_attendance_subjects enable row level security;
alter table public.user_mark_items enable row level security;
alter table public.study_material_votes enable row level security;
alter table public.study_material_share_events enable row level security;
alter table public.study_material_submissions enable row level security;
alter table public.contributors enable row level security;
alter table public.contributor_applications enable row level security;
