create table if not exists public.staff_profiles (
  discord_id text primary key,
  username text not null,
  avatar_url text not null default '',
  staff_rank text not null default 'Staff',
  first_login timestamptz not null default now(),
  last_login timestamptz not null default now()
);

create table if not exists public.moderation_logs (
  id uuid primary key,
  submitted_by text not null references public.staff_profiles(discord_id),
  action text not null check (action in ('ban','kick','mute','warn','note')),
  user_id text not null,
  reason text not null,
  note text not null default '',
  proof_url text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  points integer not null default 0 check (points in (0,5)),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  discord_message_id text
);

create index if not exists moderation_logs_staff_history on public.moderation_logs(submitted_by, created_at desc);
create index if not exists moderation_logs_leaderboard on public.moderation_logs(status, submitted_by);

create table if not exists public.inactivity_requests (
  id uuid primary key,
  submitted_by text not null references public.staff_profiles(discord_id),
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  proof_url text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  discord_message_id text,
  check (end_date >= start_date)
);

create table if not exists public.staff_schedules (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null references public.staff_profiles(discord_id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists staff_schedules_start on public.staff_schedules(start_at);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  created_by text not null references public.staff_profiles(discord_id),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  discord_message_id text
);

create or replace view public.staff_leaderboard as
select
  p.discord_id,
  p.username,
  p.avatar_url,
  p.staff_rank,
  (coalesce(sum(l.points) filter (where l.status = 'approved'), 0))::integer as points,
  (count(l.id) filter (where l.status = 'approved'))::integer as approved_actions
from public.staff_profiles p
left join public.moderation_logs l on l.submitted_by = p.discord_id
group by p.discord_id, p.username, p.avatar_url, p.staff_rank;

alter table public.staff_profiles enable row level security;
alter table public.moderation_logs enable row level security;
alter table public.inactivity_requests enable row level security;
alter table public.staff_schedules enable row level security;
alter table public.announcements enable row level security;

revoke all on public.staff_profiles, public.moderation_logs, public.inactivity_requests, public.staff_schedules, public.announcements from anon, authenticated;
grant all on public.staff_profiles, public.moderation_logs, public.inactivity_requests, public.staff_schedules, public.announcements to service_role;
grant select on public.staff_leaderboard to service_role;
