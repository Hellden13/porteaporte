-- ============================================================
-- PorteÀPorte — Idempotence webhooks Stripe + crédit PorteCoins
-- À exécuter dans Supabase SQL Editor (Production).
-- Sécurité: pas de SELECT public; accès normal via service_role (API).
-- ============================================================

create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null default '',
  processed_at timestamptz not null default now()
);

create table if not exists public.stripe_credits_applied (
  payment_intent_id text primary key,
  credited_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is 'Dédoublonnage des évènements Stripe (event.id)';
comment on table public.stripe_credits_applied is 'Un crédit PorteCoins au plus une fois par PaymentIntent achat_coins';
