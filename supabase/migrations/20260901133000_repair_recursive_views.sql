-- Repair five production views that were accidentally replaced by self-references.
-- Views are rebuilt from their canonical source tables; no application data is changed.

begin;

drop view if exists public.badge_campaign_status;
create view public.badge_campaign_status
with (security_invoker = true)
as
select
  b.id,
  b.slug,
  b.name,
  b.icon,
  b.category,
  b.active,
  b.paused,
  b.campaign_name,
  b.role_filter,
  b.auto_trigger,
  b.active_from,
  b.active_until,
  b.benefit_from,
  b.benefit_until,
  b.max_recipients,
  b.seasonal_months,
  b.points_reward,
  b.xp_reward,
  coalesce(ub.recipients_count, 0::bigint) as recipients_count,
  case
    when coalesce(b.paused, false) then 'pause'
    when not coalesce(b.active, true) then 'inactif'
    when b.active_until is not null and b.active_until < now() then 'termine'
    when b.active_from is not null and b.active_from > now() then 'planifie'
    else 'actif'
  end as campaign_status,
  (
    coalesce(b.active, true)
    and not coalesce(b.paused, false)
    and (b.benefit_from is null or b.benefit_from <= now())
    and (b.benefit_until is null or b.benefit_until >= now())
  ) as benefit_active_now,
  b.created_at
from public.badges b
left join (
  select badge_id, count(*) as recipients_count
  from public.user_badges
  where badge_id is not null
  group by badge_id
) ub on ub.badge_id = b.id;

drop view if exists public.v_driver_scores;
create view public.v_driver_scores
with (security_invoker = true)
as
select
  p.id as user_id,
  p.prenom,
  p.score_confiance as score_global,
  p.score_ponctualite,
  p.score_fiabilite,
  p.score_comportement,
  p.taux_annulation,
  p.nb_trajets_chauffeur,
  p.nb_trajets_passager,
  coalesce(round(avg(r.rating)::numeric, 2), 0::numeric) as note_moyenne,
  count(r.id) as nb_avis,
  coalesce(round(avg(r.note_ponctualite)::numeric, 2), 0::numeric) as note_moy_ponctualite,
  coalesce(round(avg(r.note_fiabilite)::numeric, 2), 0::numeric) as note_moy_fiabilite,
  coalesce(round(avg(r.note_comportement)::numeric, 2), 0::numeric) as note_moy_comportement
from public.profiles p
left join public.reviews r on r.reviewed_id = p.id
group by
  p.id,
  p.prenom,
  p.score_confiance,
  p.score_ponctualite,
  p.score_fiabilite,
  p.score_comportement,
  p.taux_annulation,
  p.nb_trajets_chauffeur,
  p.nb_trajets_passager;

drop view if exists public.v_livreur_balance;
create view public.v_livreur_balance
with (security_invoker = true)
as
select
  user_id,
  coalesce(sum(net_amount) filter (
    where status = 'available' and available_after <= now()
  ), 0::numeric) as balance_available,
  coalesce(sum(net_amount) filter (where status = 'pending'), 0::numeric) as balance_pending,
  coalesce(sum(net_amount), 0::numeric) as total_earned,
  coalesce(sum(net_amount) filter (where status = 'transferred'), 0::numeric) as total_transferred
from public.livreur_earnings
group by user_id;

drop view if exists public.v_protection_fund_balance;
create view public.v_protection_fund_balance
with (security_invoker = true)
as
select
  coalesce(sum(amount_cents) filter (where entry_type = 'contribution'), 0::bigint) as total_contributions_cents,
  coalesce(sum(amount_cents) filter (where entry_type = 'payout'), 0::bigint) as total_payouts_cents,
  coalesce(sum(amount_cents) filter (where entry_type = 'adjustment'), 0::bigint) as total_adjustments_cents,
  coalesce(sum(
    case
      when entry_type = 'contribution' then amount_cents
      when entry_type = 'payout' then -amount_cents
      when entry_type = 'adjustment' then amount_cents
      else 0
    end
  ), 0::bigint) as balance_cents,
  count(*) as nb_entries
from public.protection_fund_ledger;

drop view if exists public.v_user_fiabilite;
create view public.v_user_fiabilite
with (security_invoker = true)
as
select
  p.id,
  p.email,
  p.score,
  count(m.id) filter (where m.statut = 'valide') as manquements_valides,
  count(m.id) filter (where m.statut = 'partage') as manquements_partages,
  count(m.id) filter (where m.statut in ('signale', 'conteste')) as manquements_en_attente
from public.profiles p
left join public.manquements m on m.accuse_id = p.id
group by p.id, p.email, p.score;

revoke all on public.badge_campaign_status from anon;
revoke all on public.v_driver_scores from anon;
revoke all on public.v_livreur_balance from anon;
revoke all on public.v_user_fiabilite from anon;

grant select on public.badge_campaign_status to authenticated, service_role;
grant select on public.v_driver_scores to authenticated, service_role;
grant select on public.v_livreur_balance to authenticated, service_role;
grant select on public.v_protection_fund_balance to anon, authenticated, service_role;
grant select on public.v_user_fiabilite to authenticated, service_role;

commit;
