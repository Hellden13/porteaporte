begin;

-- Privileged RPCs are called only by server-side handlers using service_role.
-- PostgreSQL grants EXECUTE to PUBLIC by default, so revoke it explicitly.
revoke all on function public.award_claim_free_milestone(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.cleanup_rate_limits() from public, anon, authenticated;
revoke all on function public.get_claim_free_days(uuid) from public, anon, authenticated;
revoke all on function public.grant_badge_v2(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.increment_promo_uses(uuid) from public, anon, authenticated;
revoke all on function public.platform_claim_free_days() from public, anon, authenticated;
revoke all on function public.record_driver_litige(uuid) from public, anon, authenticated;

grant execute on function public.award_claim_free_milestone(uuid, text, integer) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.cleanup_rate_limits() to service_role;
grant execute on function public.get_claim_free_days(uuid) to service_role;
grant execute on function public.grant_badge_v2(uuid, text, text, boolean) to service_role;
grant execute on function public.increment_promo_uses(uuid) to service_role;
grant execute on function public.platform_claim_free_days() to service_role;
grant execute on function public.record_driver_litige(uuid) to service_role;

-- Trigger functions must not be exposed as RPC endpoints.
revoke all on function public.pap_prevent_profile_self_escalation() from public, anon, authenticated;
revoke all on function public.protect_profile_privileged_columns() from public, anon, authenticated;
revoke all on function public.safe_meeting_point_report_count() from public, anon, authenticated;
grant execute on function public.pap_prevent_profile_self_escalation() to service_role;
grant execute on function public.protect_profile_privileged_columns() to service_role;
grant execute on function public.safe_meeting_point_report_count() to service_role;

-- pap_is_admin is used inside authenticated RLS policies, but anonymous users
-- do not need to call it directly.
revoke all on function public.pap_is_admin() from public, anon;
grant execute on function public.pap_is_admin() to authenticated, service_role;

-- Pin function resolution to trusted schemas to prevent search-path attacks.
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.grant_badge_v2(uuid, text, text, boolean) set search_path = public, auth, pg_temp;
alter function public.check_rate_limit(text, integer, integer) set search_path = public, pg_temp;
alter function public.cleanup_rate_limits() set search_path = public, pg_temp;
alter function public.record_driver_litige(uuid) set search_path = public, pg_temp;
alter function public.get_claim_free_days(uuid) set search_path = public, pg_temp;
alter function public.award_claim_free_milestone(uuid, text, integer) set search_path = public, pg_temp;
alter function public.platform_claim_free_days() set search_path = public, pg_temp;
alter function public.touch_safe_meeting_points_updated() set search_path = public, pg_temp;
alter function public.increment_promo_uses(uuid) set search_path = public, pg_temp;

commit;
