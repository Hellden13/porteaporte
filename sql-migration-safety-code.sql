-- PorteaPorte - Code securite covoiturage
-- Executer dans Supabase SQL Editor avant d'activer le flux en production.

alter table if exists public.profiles
  add column if not exists ride_safety_code_hash text,
  add column if not exists ride_safety_code_set_at timestamptz;

alter table if exists public.ride_bookings
  add column if not exists safety_code_hash text,
  add column if not exists safety_code_custom boolean default false,
  add column if not exists safety_code_set_at timestamptz,
  add column if not exists safety_code_verified_at timestamptz,
  add column if not exists safety_alert_triggered boolean default false,
  add column if not exists driver_completed_at timestamptz,
  add column if not exists passenger_confirmed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists completion_actor text;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.ride_bookings'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.ride_bookings drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.ride_bookings
  add constraint ride_bookings_status_check
  check (status in (
    'en_attente',
    'confirme',
    'driver_completed',
    'paye',
    'annule_passager',
    'annule_chauffeur',
    'complete',
    'completed',
    'termine',
    'cancelled',
    'refunded',
    'rembourse'
  ));

create index if not exists idx_ride_bookings_driver_completed_timeout
  on public.ride_bookings (updated_at)
  where status = 'driver_completed' and safety_alert_triggered = false;

create index if not exists idx_ride_bookings_safety_alert
  on public.ride_bookings (safety_alert_triggered)
  where safety_alert_triggered = true;
