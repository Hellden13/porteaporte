-- PorteaPorte - Securite covoiturage phase 2
-- Contacts d'urgence + alerte silencieuse GPS.

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  priority integer not null check (priority between 1 and 3),
  name text not null,
  phone text,
  email text,
  is_porteaporte boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, priority)
);

alter table public.emergency_contacts enable row level security;

drop policy if exists "ec_own_all" on public.emergency_contacts;
drop policy if exists "ec_admin_all" on public.emergency_contacts;
create policy "ec_own_all" on public.emergency_contacts
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "ec_admin_all" on public.emergency_contacts
  for all
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

create index if not exists idx_emergency_contacts_user on public.emergency_contacts(user_id);

create table if not exists public.ride_gps_trail (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.ride_bookings(id) on delete cascade,
  ride_id uuid not null references public.rides(id) on delete cascade,
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  recorded_at timestamptz default now(),
  expires_at timestamptz default now() + interval '48 hours'
);

alter table public.ride_gps_trail enable row level security;
drop policy if exists "gps_trail_admin_all" on public.ride_gps_trail;
create policy "gps_trail_admin_all" on public.ride_gps_trail
  for all
  to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

create index if not exists idx_gps_trail_booking on public.ride_gps_trail(booking_id);
create index if not exists idx_gps_trail_expires on public.ride_gps_trail(expires_at);

alter table public.ride_bookings
  add column if not exists alert_sent_at timestamptz,
  add column if not exists last_gps_lat numeric(10,7),
  add column if not exists last_gps_lng numeric(10,7),
  add column if not exists last_gps_at timestamptz,
  add column if not exists safety_code_failed_attempts integer not null default 0;

