-- Zero Se Shuru: Supabase schema. Applied by tools/setup-supabase.ps1 (or paste it into the SQL editor).
-- Safe to run again: every statement creates only what is missing or replaces itself.
-- Row-level security is on for every table. The publishable (anon) key can only do what these
-- policies allow; the secret key is never used by the app.
-- Review fix (2026-11-20): admins are identified by user id, not by email, because sign-up does not
-- prove that someone owns an email address.

-- Admins: read only through is_admin(), never directly.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Student data: each user sees and changes only their own rows.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text check (char_length(name) <= 100),
  college text check (char_length(college) <= 150),
  grad_year int check (grad_year between 2000 and 2100),
  roles text[] not null default '{}',
  cities text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.saved_jobs (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_key text not null check (char_length(job_key) <= 200),
  status text not null default 'saved' check (status in ('saved', 'applied', 'interview', 'offer', 'rejected')),
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_key)
);
alter table public.saved_jobs enable row level security;
drop policy if exists "own saves" on public.saved_jobs;
create policy "own saves" on public.saved_jobs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admin overrides. Anyone may read them (the page and the daily run apply them); only admins write.
-- They hold no actor identity: who did what goes to admin_audit, which only admins can read.
create table if not exists public.hidden_posts (
  job_key text primary key,
  reason text check (char_length(reason) <= 300),
  at timestamptz not null default now()
);
create table if not exists public.blocked_companies (
  company_key text primary key,
  reason text check (char_length(reason) <= 300),
  at timestamptz not null default now()
);
create table if not exists public.tag_fixes (
  job_key text primary key,
  role text,
  cities text[],
  reason text check (char_length(reason) <= 300),
  at timestamptz not null default now()
);
create table if not exists public.board_switches (
  ats text not null check (ats in ('greenhouse', 'lever', 'ashby')),
  token text not null,
  is_on boolean not null,
  reason text check (char_length(reason) <= 300),
  at timestamptz not null default now(),
  primary key (ats, token)
);

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  actor_email text default (auth.jwt() ->> 'email'),
  table_name text not null,
  action text not null,
  row_data jsonb
);
alter table public.admin_audit enable row level security;
drop policy if exists "admins read audit" on public.admin_audit;
create policy "admins read audit" on public.admin_audit for select to authenticated using (public.is_admin());

create or replace function public.audit_override() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit (table_name, action, row_data)
  values (tg_table_name, tg_op, to_jsonb(coalesce(new, old)));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['hidden_posts', 'blocked_companies', 'tag_fixes', 'board_switches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "anyone reads" on public.%I', t);
    execute format('create policy "anyone reads" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "admins write" on public.%I', t);
    execute format('create policy "admins write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_override()', t);
  end loop;
end $$;

-- Counts for the admin dashboard. Never a list of users.
create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  return json_build_object(
    'users', (select count(*) from auth.users),
    'profiles', (select count(*) from public.profiles),
    'saves_by_status', coalesce((select json_object_agg(status, n) from (select status, count(*) as n from public.saved_jobs group by status) s), '{}'::json)
  );
end $$;
revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

-- Explicit grants, so access never depends on the platform's default privileges. RLS still decides rows.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.saved_jobs to authenticated;
grant select on public.hidden_posts, public.blocked_companies, public.tag_fixes, public.board_switches to anon, authenticated;
grant insert, update, delete on public.hidden_posts, public.blocked_companies, public.tag_fixes, public.board_switches to authenticated;
grant select on public.admin_audit to authenticated;

-- Last step, AFTER you have signed up on the site yourself: make that account the admin
-- (tools/setup-supabase.ps1 -MakeAdmin does this). By hand: check that the email is yours, then run:
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
