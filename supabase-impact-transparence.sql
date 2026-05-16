-- PorteaPorte - Transparence dons mensuels
-- A executer dans Supabase SQL Editor.

create table if not exists public.impact_settings (
  id text primary key default 'default',
  donation_rate_percent numeric(6,2) not null default 5 check (donation_rate_percent >= 0 and donation_rate_percent <= 100),
  platform_commission_percent numeric(6,2) not null default 12 check (platform_commission_percent >= 0 and platform_commission_percent <= 100),
  public_note text default 'Montants estimes en direct, confirmes mensuellement.',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.impact_organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  website_url text,
  logo_url text,
  active boolean not null default true,
  allocation_percent numeric(6,2) not null default 0 check (allocation_percent >= 0 and allocation_percent <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.impact_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,
  revenue_cents integer not null default 0,
  commission_cents integer not null default 0,
  donation_pool_cents integer not null default 0,
  status text not null default 'estimated' check (status in ('estimated','confirmed','paid')),
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.impact_applications (
  id uuid primary key default gen_random_uuid(),
  organisation_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  website_url text,
  mission text not null,
  requested_support text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','contacted')),
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.impact_settings enable row level security;
alter table public.impact_organisations enable row level security;
alter table public.impact_monthly_reports enable row level security;
alter table public.impact_applications enable row level security;

drop policy if exists impact_settings_public_read on public.impact_settings;
drop policy if exists impact_settings_admin_all on public.impact_settings;
create policy impact_settings_public_read on public.impact_settings
  for select using (true);
create policy impact_settings_admin_all on public.impact_settings
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists impact_org_public_read on public.impact_organisations;
drop policy if exists impact_org_admin_all on public.impact_organisations;
create policy impact_org_public_read on public.impact_organisations
  for select using (active = true);
create policy impact_org_admin_all on public.impact_organisations
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists impact_reports_public_read on public.impact_monthly_reports;
drop policy if exists impact_reports_admin_all on public.impact_monthly_reports;
create policy impact_reports_public_read on public.impact_monthly_reports
  for select using (true);
create policy impact_reports_admin_all on public.impact_monthly_reports
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists impact_applications_public_insert on public.impact_applications;
drop policy if exists impact_applications_admin_all on public.impact_applications;
create policy impact_applications_public_insert on public.impact_applications
  for insert with check (status = 'pending');
create policy impact_applications_admin_all on public.impact_applications
  for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

grant select on public.impact_settings to anon, authenticated;
grant select on public.impact_organisations to anon, authenticated;
grant select on public.impact_monthly_reports to anon, authenticated;
grant insert on public.impact_applications to anon, authenticated;

insert into public.impact_settings (id, donation_rate_percent, platform_commission_percent, public_note)
values ('default', 5, 12, 'Montants estimes en direct, confirmes mensuellement.')
on conflict (id) do nothing;

insert into public.impact_organisations (name, description, website_url, active, allocation_percent, sort_order)
values
  ('Club des petits dejeuners', 'Soutien alimentaire aux enfants et aux ecoles.', 'https://www.breakfastclubcanada.org/fr/', true, 30, 1),
  ('Banques alimentaires Quebec', 'Aide alimentaire locale et regionale.', 'https://banquesalimentaires.org/', true, 70, 2)
on conflict do nothing;
