-- Stripe pour le covoiturage: stockage PaymentIntent + etat de paiement.
-- Migration additive, sans modifier les statuts metier existants.

alter table if exists ride_bookings
  add column if not exists stripe_payment_intent text,
  add column if not exists payment_status text,
  add column if not exists payment_currency text default 'cad',
  add column if not exists payment_authorized_at timestamptz,
  add column if not exists paid_at timestamptz;

create unique index if not exists idx_ride_bookings_stripe_payment_intent
  on ride_bookings(stripe_payment_intent)
  where stripe_payment_intent is not null;

create index if not exists idx_ride_bookings_payment_status
  on ride_bookings(payment_status);

create index if not exists idx_transactions_ride_booking
  on transactions ((metadata->>'booking_id'))
  where metadata ? 'booking_id';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'transactions_statut_check'
      and conrelid = to_regclass('public.transactions')
  ) then
    alter table public.transactions drop constraint transactions_statut_check;
  end if;
end $$;

alter table public.transactions
  add constraint transactions_statut_check
  check (statut in (
    'en_attente',
    'complete',
    'echec',
    'annule',
    'rembourse',
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'requires_capture',
    'succeeded',
    'canceled'
  ));
