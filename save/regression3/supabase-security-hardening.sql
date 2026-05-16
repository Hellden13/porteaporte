-- PorteaPorte - durcissement production post-audit
-- A executer dans Supabase SQL Editor apres verification.

begin;

-- Les fonctions SECURITY DEFINER sensibles ne doivent pas etre appelables via anon/auth REST.
revoke execute on function public.ajouter_coins(uuid, integer, text, text, uuid) from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.verifier_transfert_coins(uuid, integer) from anon, authenticated;

-- Conserver l'usage backend service_role uniquement. Les endpoints Vercel utilisent SUPABASE_SERVICE_KEY.
grant execute on function public.ajouter_coins(uuid, integer, text, text, uuid) to service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.verifier_transfert_coins(uuid, integer) to service_role;

-- Search path explicite pour les fonctions connues.
alter function public.handle_new_user() set search_path = public;
alter function public.ajouter_coins(uuid, integer, text, text, uuid) set search_path = public;
alter function public.verifier_transfert_coins(uuid, integer) set search_path = public;
alter function public.update_mis_a_jour_le() set search_path = public;

-- Index FK recommandes par les advisors performance.
create index if not exists evaluations_auteur_id_idx on public.evaluations(auteur_id);
create index if not exists evaluations_cible_id_idx on public.evaluations(cible_id);
create index if not exists litiges_plaignant_id_idx on public.litiges(plaignant_id);
create index if not exists litiges_cible_id_idx on public.litiges(cible_id);
create index if not exists profiles_parrain_id_idx on public.profiles(parrain_id);

-- Table legacy detectee avec RLS sans policy: bloquer explicitement tant qu'elle n'est pas utilisee.
revoke all on public.payment_transactions from anon, authenticated;

commit;
