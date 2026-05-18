create table if not exists public.draw_winners (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.monthly_draws(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  prize_title text not null,
  published boolean not null default false,
  entries_weight integer not null default 1,
  user_email text,
  user_role text,
  selected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.draw_winners enable row level security;

drop policy if exists draw_winners_public_read on public.draw_winners;
drop policy if exists draw_winners_admin_all on public.draw_winners;

create policy draw_winners_public_read
on public.draw_winners
for select
using (published = true);

create policy draw_winners_admin_all
on public.draw_winners
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.suspendu, false) = false
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.suspendu, false) = false
  )
);

grant select on public.draw_winners to anon, authenticated;
grant insert, update, delete on public.draw_winners to authenticated;

notify pgrst, 'reload schema';

select
  id,
  draw_id,
  user_id,
  user_email,
  user_role,
  prize_title,
  published,
  created_at
from public.draw_winners
order by created_at desc
limit 10;
