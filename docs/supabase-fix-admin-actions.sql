-- Fix for admin approve/reject buttons in Supabase.
-- Replace YOUR_ADMIN_EMAIL with the same email you use to sign in on owner-panel.html.

alter table public.submissions enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.submissions to anon, authenticated;

drop policy if exists "Admin can update submissions" on public.submissions;
create policy "Admin can update submissions"
on public.submissions
for update
to authenticated
using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL')
with check ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL');

-- Optional: make sure the same admin can still read pending/rejected rows.
drop policy if exists "Admin can read all submissions" on public.submissions;
create policy "Admin can read all submissions"
on public.submissions
for select
to authenticated
using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL');
