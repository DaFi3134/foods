-- SQL для Supabase.
-- Перед запуском замени YOUR_ADMIN_EMAIL на свой email владельца сайта.
-- Этот же email нужно указать в docs/js/submission-config.js -> adminEmail.

create extension if not exists pgcrypto;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('product', 'recipe', 'article', 'myth')),
  title text not null,
  author_name text,
  author_email text,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  moderator_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- Нужно, если в проекте выключено "Automatically expose new tables".
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
