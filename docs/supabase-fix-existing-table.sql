-- Run this in Supabase SQL Editor if you already created the submissions table
-- and see: column submissions.updated_at does not exist.
-- Replace YOUR_ADMIN_EMAIL in the policies below before running.

create extension if not exists pgcrypto;

alter table public.submissions add column if not exists type text;
alter table public.submissions add column if not exists title text;
alter table public.submissions add column if not exists author_name text;
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

alter table public.submissions alter column type set not null;
alter table public.submissions alter column title set not null;
alter table public.submissions alter column payload set not null;
alter table public.submissions alter column status set not null;
alter table public.submissions alter column created_at set not null;
alter table public.submissions alter column updated_at set not null;

create index if not exists submissions_status_idx on public.submissions (status);
create index if not exists submissions_type_idx on public.submissions (type);
create index if not exists submissions_created_at_idx on public.submissions (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
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

alter table public.submissions enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.submissions to anon, authenticated;

drop policy if exists "Anyone can create pending submissions" on public.submissions;
create policy "Anyone can create pending submissions"
on public.submissions
for insert
to anon, authenticated
with check (status = 'pending');

drop policy if exists "Anyone can read approved submissions" on public.submissions;
create policy "Anyone can read approved submissions"
on public.submissions
for select
to anon, authenticated
using (status = 'approved');

drop policy if exists "Admin can read all submissions" on public.submissions;
create policy "Admin can read all submissions"
on public.submissions
for select
to authenticated
using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL');

drop policy if exists "Admin can update submissions" on public.submissions;
create policy "Admin can update submissions"
on public.submissions
for update
to authenticated
using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL')
with check ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL');

drop policy if exists "Admin can delete submissions" on public.submissions;
create policy "Admin can delete submissions"
on public.submissions
for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL');
