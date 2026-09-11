-- healthy food / Supabase schema v3
-- Run this file in Supabase SQL Editor before deploying Edge Functions.
-- The script is designed to be safe to re-run against the existing project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. User submissions
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'article',
  title text not null default 'Untitled submission',
  author_name text,
  author_contact text,
  author_email text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  moderator_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.submissions add column if not exists type text default 'article';
alter table public.submissions add column if not exists title text default 'Untitled submission';
alter table public.submissions add column if not exists author_name text;
alter table public.submissions add column if not exists author_contact text;
alter table public.submissions add column if not exists author_email text;
alter table public.submissions add column if not exists payload jsonb default '{}'::jsonb;
alter table public.submissions add column if not exists status text default 'pending';
alter table public.submissions add column if not exists moderator_note text;
alter table public.submissions add column if not exists created_at timestamptz default now();
alter table public.submissions add column if not exists updated_at timestamptz default now();

update public.submissions
set
  type = coalesce(nullif(type, ''), 'article'),
  title = coalesce(nullif(title, ''), 'Untitled submission'),
  payload = coalesce(payload, '{}'::jsonb),
  status = coalesce(nullif(status, ''), 'pending'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

-- Migrate private form fields from older payloads into columns visible only to
-- the moderation table. Then remove those values from payload itself.
update public.submissions
set
  author_contact = coalesce(
    nullif(author_contact, ''),
    nullif(payload #>> '{fields,Контакт}', ''),
    nullif(payload #>> '{fields,Контакт для связи}', ''),
    nullif(payload #>> '{fields,Email}', '')
  ),
  moderator_note = coalesce(
    nullif(moderator_note, ''),
    nullif(payload #>> '{fields,Комментарий}', ''),
    nullif(payload #>> '{fields,Комментарий модератору}', '')
  )
where jsonb_typeof(payload -> 'fields') = 'object';

-- Earlier browser code sometimes copied the contact into author_name when no
-- explicit author was provided. Clear that accidental public alias.
update public.submissions
set author_name = null
where author_contact is not null
  and author_name = author_contact
  and coalesce(payload #>> '{fields,Автор}', '') = '';

update public.submissions
set payload = jsonb_set(
  payload,
  '{fields}',
  coalesce(payload -> 'fields', '{}'::jsonb)
    - 'Контакт'
    - 'Контакт для связи'
    - 'Email'
    - 'E-mail'
    - 'Телефон'
    - 'Telegram'
    - 'Комментарий'
    - 'Комментарий модератору',
  true
)
where jsonb_typeof(payload -> 'fields') = 'object';

create index if not exists submissions_status_idx on public.submissions(status);
create index if not exists submissions_type_idx on public.submissions(type);
create index if not exists submissions_created_at_idx on public.submissions(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists submissions_set_updated_at on public.submissions;
create trigger submissions_set_updated_at
before update on public.submissions
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Administrators
-- ---------------------------------------------------------------------------
-- Admin rights are tied to an Auth user UUID. No administrator email is stored
-- in public JavaScript.
create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.site_admins enable row level security;
revoke all on table public.site_admins from public, anon, authenticated;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.site_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security for submissions
-- ---------------------------------------------------------------------------
alter table public.submissions enable row level security;

-- Remove both the old email-based policies and policies from earlier patches.
drop policy if exists "Anyone can create pending submissions" on public.submissions;
drop policy if exists "Anyone can read approved submissions" on public.submissions;
drop policy if exists "Admin can read all submissions" on public.submissions;
drop policy if exists "Admin can update submissions" on public.submissions;
drop policy if exists "Admin can delete submissions" on public.submissions;
drop policy if exists "Public can insert pending submissions" on public.submissions;
drop policy if exists "Site admins can read submissions" on public.submissions;
drop policy if exists "Site admins can update submissions" on public.submissions;
drop policy if exists "Site admins can delete submissions" on public.submissions;

-- Browsers cannot insert directly anymore. New submissions go through the
-- submit-content Edge Function, which validates and rate-limits them before
-- using a server-side secret key.
revoke all on table public.submissions from anon, authenticated;
grant select, update, delete on table public.submissions to authenticated;

create policy "Site admins can read submissions"
on public.submissions
for select
to authenticated
using (public.is_site_admin());

create policy "Site admins can update submissions"
on public.submissions
for update
to authenticated
using (public.is_site_admin())
with check (
  public.is_site_admin()
  and status in ('pending', 'approved', 'rejected')
  and type in ('product', 'recipe', 'article', 'myth')
  and char_length(title) between 1 and 180
);

create policy "Site admins can delete submissions"
on public.submissions
for delete
to authenticated
using (public.is_site_admin());

-- Public content is exposed through a narrow view. Private moderation fields
-- such as author_email and moderator_note are intentionally not selected.
drop view if exists public.approved_submissions;
create view public.approved_submissions
with (security_barrier = true)
as
select
  id,
  type,
  title,
  case
    when jsonb_typeof(payload -> 'fields') = 'object' then
      jsonb_build_object(
        'fields',
        (payload -> 'fields')
          - 'Контакт'
          - 'Контакт для связи'
          - 'Email'
          - 'E-mail'
          - 'Телефон'
          - 'Telegram'
          - 'Комментарий'
          - 'Комментарий модератору'
      )
    else jsonb_build_object('fields', '{}'::jsonb)
  end as payload,
  status,
  created_at,
  updated_at,
  author_name
from public.submissions
where status = 'approved';

revoke all on public.approved_submissions from public;
grant select on public.approved_submissions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Generic server-side rate limiting
-- ---------------------------------------------------------------------------
-- Only Edge Functions using a secret/service-role key may access this table
-- and RPC. We store only a salted SHA-256 identifier, never a plain IP.
create table if not exists public.request_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.request_rate_limits enable row level security;
revoke all on table public.request_rate_limits from public, anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_limit integer default 12,
  p_window_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 100));
  v_window integer := greatest(60, least(coalesce(p_window_seconds, 3600), 86400));
begin
  if p_key_hash is null or char_length(p_key_hash) < 16 then
    return false;
  end if;

  insert into public.request_rate_limits(key_hash, window_started_at, request_count, updated_at)
  values (p_key_hash, now(), 1, now())
  on conflict (key_hash) do update
  set
    window_started_at = case
      when public.request_rate_limits.window_started_at <= now() - make_interval(secs => v_window)
        then now()
      else public.request_rate_limits.window_started_at
    end,
    request_count = case
      when public.request_rate_limits.window_started_at <= now() - make_interval(secs => v_window)
        then 1
      else public.request_rate_limits.request_count + 1
    end,
    updated_at = now()
  returning request_count into v_count;

  return v_count <= v_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Remove legacy AI-only limiter from patch v2 if it exists. The old table is
-- intentionally left in place so applying this migration never destroys data.
drop function if exists public.consume_ai_quota(text, integer, integer);

-- ---------------------------------------------------------------------------
-- 5. One-time administrator setup
-- ---------------------------------------------------------------------------
-- First create the owner in Authentication -> Users, then run this separately:
--
-- insert into public.site_admins(user_id)
-- select id from auth.users
-- where lower(email) = lower('YOUR_ADMIN_EMAIL')
-- on conflict (user_id) do nothing;
--
-- Verify:
-- select a.user_id, u.email, a.created_at
-- from public.site_admins a
-- join auth.users u on u.id = a.user_id;
