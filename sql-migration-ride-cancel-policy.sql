-- Migration : politique d'annulation covoiturage (configurable depuis l'admin)
-- À exécuter dans Supabase → SQL Editor. Sans danger : ajoute des colonnes si absentes.

alter table public.impact_settings
  add column if not exists ride_cancel_free_window_h      numeric not null default 24,
  add column if not exists ride_cancel_late_window_h      numeric not null default 2,
  add column if not exists ride_cancel_partial_refund_pct numeric not null default 85,
  add column if not exists ride_cancel_partial_driver_pct numeric not null default 10,
  add column if not exists ride_cancel_partial_fund_pct   numeric not null default 5,
  add column if not exists ride_cancel_late_refund_pct    numeric not null default 50,
  add column if not exists ride_cancel_late_driver_pct    numeric not null default 40,
  add column if not exists ride_cancel_late_fund_pct      numeric not null default 10,
  add column if not exists delivery_cancel_assigned_fund_pct numeric not null default 2,
  add column if not exists delivery_cancel_transit_fund_pct  numeric not null default 5;

-- S'assure que la ligne 'default' a bien les valeurs (au cas où elle existait déjà)
update public.impact_settings
set ride_cancel_free_window_h      = coalesce(ride_cancel_free_window_h, 24),
    ride_cancel_late_window_h      = coalesce(ride_cancel_late_window_h, 2),
    ride_cancel_partial_refund_pct = coalesce(ride_cancel_partial_refund_pct, 85),
    ride_cancel_partial_driver_pct = coalesce(ride_cancel_partial_driver_pct, 10),
    ride_cancel_partial_fund_pct   = coalesce(ride_cancel_partial_fund_pct, 5),
    ride_cancel_late_refund_pct    = coalesce(ride_cancel_late_refund_pct, 50),
    ride_cancel_late_driver_pct    = coalesce(ride_cancel_late_driver_pct, 40),
    ride_cancel_late_fund_pct      = coalesce(ride_cancel_late_fund_pct, 10)
where id = 'default';
