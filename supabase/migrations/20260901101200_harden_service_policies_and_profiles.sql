begin;

-- These policies were named as service policies but applied to PUBLIC because
-- no target role was specified. Scope them explicitly to the service role.
drop policy if exists "messages_service" on public.messages;
create policy "messages_service"
  on public.messages
  to service_role
  using (true)
  with check (true);

drop policy if exists "refcode_service" on public.referral_codes;
create policy "refcode_service"
  on public.referral_codes
  to service_role
  using (true)
  with check (true);

drop policy if exists "referral_service" on public.referrals;
create policy "referral_service"
  on public.referrals
  to service_role
  using (true)
  with check (true);

-- Owners may edit their profile row, but must never self-promote or alter
-- verification, suspension, balances, scores, or Stripe-managed state.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.role() = 'service_role' or public.pap_is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.coins is distinct from old.coins
     or new.xp is distinct from old.xp
     or new.niveau is distinct from old.niveau
     or new.livraisons is distinct from old.livraisons
     or new.score is distinct from old.score
     or new.actif is distinct from old.actif
     or new.suspendu is distinct from old.suspendu
     or new.raison_suspension is distinct from old.raison_suspension
     or new.email_verified is distinct from old.email_verified
     or new.verification_status is distinct from old.verification_status
     or new.driver_status is distinct from old.driver_status
     or new.eco_bonus is distinct from old.eco_bonus
     or new.score_confiance is distinct from old.score_confiance
     or new.score_ponctualite is distinct from old.score_ponctualite
     or new.score_fiabilite is distinct from old.score_fiabilite
     or new.score_comportement is distinct from old.score_comportement
     or new.taux_annulation is distinct from old.taux_annulation
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.subscription_plan is distinct from old.subscription_plan
     or new.subscription_status is distinct from old.subscription_status
     or new.subscription_end_at is distinct from old.subscription_end_at
     or new.stripe_identity_session_id is distinct from old.stripe_identity_session_id
     or new.stripe_identity_status is distinct from old.stripe_identity_status
     or new.loyalty_bonus_pct is distinct from old.loyalty_bonus_pct
     or new.loyalty_bonus_manual is distinct from old.loyalty_bonus_manual
     or new.photo_status is distinct from old.photo_status
     or new.photo_moderated_at is distinct from old.photo_moderated_at
     or new.photo_moderation_reason is distinct from old.photo_moderation_reason
     or new.pet_photo_status is distinct from old.pet_photo_status
  then
    raise exception 'Modification de champs protégés interdite'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_privileged_fields() from public, anon, authenticated;
grant execute on function public.protect_profile_privileged_fields() to service_role;

drop trigger if exists protect_profile_privileged_fields on public.profiles;
create trigger protect_profile_privileged_fields
before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

commit;
