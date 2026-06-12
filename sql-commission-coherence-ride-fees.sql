-- PorteaPorte - repartition officielle + paliers frais covoiturage
-- A executer manuellement dans Supabase. Ne pas lancer depuis Codex.

alter table public.platform_settings
  add column if not exists pct_livreur numeric default 60,
  add column if not exists pct_stripe numeric default 7,
  add column if not exists pct_developpement numeric default 5,
  add column if not exists pct_protection numeric default 10,
  add column if not exists pct_urgence numeric default 6,
  add column if not exists pct_communaute numeric default 5,
  add column if not exists pct_profit numeric default 7,
  add column if not exists pct_marketing numeric default 0,
  add column if not exists pct_operations numeric default 0;

insert into public.platform_settings (
  id,
  pct_livreur,
  pct_stripe,
  pct_developpement,
  pct_protection,
  pct_urgence,
  pct_communaute,
  pct_profit,
  pct_marketing,
  pct_operations
) values (
  'default',
  60,
  7,
  5,
  10,
  6,
  5,
  7,
  0,
  0
)
on conflict (id) do update set
  pct_livreur = excluded.pct_livreur,
  pct_stripe = excluded.pct_stripe,
  pct_developpement = excluded.pct_developpement,
  pct_protection = excluded.pct_protection,
  pct_urgence = excluded.pct_urgence,
  pct_communaute = excluded.pct_communaute,
  pct_profit = excluded.pct_profit,
  pct_marketing = excluded.pct_marketing,
  pct_operations = excluded.pct_operations;

alter table public.impact_settings
  add column if not exists ride_fee_threshold numeric default 15,
  add column if not exists ride_platform_fee_high numeric default 3;

insert into public.impact_settings (
  id,
  ride_platform_fee,
  ride_fee_threshold,
  ride_platform_fee_high
) values (
  'default',
  1.50,
  15,
  3.00
)
on conflict (id) do update set
  ride_platform_fee = excluded.ride_platform_fee,
  ride_fee_threshold = excluded.ride_fee_threshold,
  ride_platform_fee_high = excluded.ride_platform_fee_high;

comment on column public.impact_settings.ride_fee_threshold
  is 'Seuil du palier haut pour les frais de service covoiturage.';

comment on column public.impact_settings.ride_platform_fee_high
  is 'Frais de service covoiturage applique quand le total passager atteint le seuil.';
