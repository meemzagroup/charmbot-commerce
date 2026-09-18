-- Platform-owner-only hard delete of a single tenant company.
-- Deletes company-scoped rows in FK-safe order; audit logs are preserved
-- (their company_id is nulled) and shared platform/package config is untouched.
create or replace function public.platform_delete_company(_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _name text;
  _deleted_users uuid[];
begin
  select name into _name from public.companies where id = _company_id;
  if _name is null then
    raise exception 'Company not found';
  end if;

  -- children of company-scoped parents first
  delete from public.order_items where order_id in (select id from public.orders where company_id = _company_id);
  delete from public.whatsapp_campaign_logs where company_id = _company_id
    or campaign_id in (select id from public.whatsapp_campaigns where company_id = _company_id);
  delete from public.whatsapp_campaigns where company_id = _company_id;
  delete from public.whatsapp_templates where company_id = _company_id;
  delete from public.messages where company_id = _company_id
    or thread_id in (select id from public.communication_threads where company_id = _company_id);
  delete from public.call_logs where company_id = _company_id;
  delete from public.communication_threads where company_id = _company_id;
  delete from public.whatsapp_channels where company_id = _company_id;

  delete from public.visits where company_id = _company_id;
  delete from public.journey_plans where company_id = _company_id;
  delete from public.collections where company_id = _company_id;
  delete from public.customer_allocations where company_id = _company_id;
  delete from public.competitor_intel where company_id = _company_id;
  delete from public.target_recovery_plans where company_id = _company_id;
  delete from public.sales_targets where company_id = _company_id;
  delete from public.incentive_payouts where company_id = _company_id;
  delete from public.incentive_rules where company_id = _company_id;
  delete from public.performance_actions where company_id = _company_id;
  delete from public.employee_documents where company_id = _company_id;
  delete from public.hr_letters where company_id = _company_id;
  delete from public.training_assignments where company_id = _company_id;
  delete from public.trainings where company_id = _company_id;
  delete from public.employee_records where company_id = _company_id;
  delete from public.job_applications where company_id = _company_id;
  delete from public.job_openings where company_id = _company_id;
  delete from public.system_alerts where company_id = _company_id;
  delete from public.attendance_records where company_id = _company_id;
  delete from public.workforce_audit_logs where company_id = _company_id;
  delete from public.territories where company_id = _company_id;

  delete from public.orders where company_id = _company_id;
  delete from public.leads_inquiries where company_id = _company_id;
  delete from public.customers where company_id = _company_id;
  delete from public.products where company_id = _company_id;
  delete from public.chatbot_conversations where company_id = _company_id;
  delete from public.invitations where company_id = _company_id;
  delete from public.user_permissions where company_id = _company_id;
  delete from public.referral_codes where company_id = _company_id;
  delete from public.team_members where company_id = _company_id;

  -- never remove platform owner accounts
  select coalesce(array_agg(id), '{}'::uuid[]) into _deleted_users
  from public.profiles
  where company_id = _company_id and is_super_admin = false;

  delete from public.user_roles where user_id = any(_deleted_users);
  delete from public.profiles where id = any(_deleted_users);
  update public.profiles set company_id = null
    where company_id = _company_id and is_super_admin = true;

  delete from public.company_secrets where company_id = _company_id;

  -- preserve audit trails, detach them from the removed company
  update public.referrals set referrer_company_id = null where referrer_company_id = _company_id;
  update public.referrals set invited_company_id = null where invited_company_id = _company_id;
  update public.security_audit_logs set company_id = null where company_id = _company_id;
  update public.platform_audit_logs set company_id = null where company_id = _company_id;

  delete from public.companies where id = _company_id;

  return jsonb_build_object('name', _name, 'deleted_user_ids', to_jsonb(_deleted_users));
end;
$$;

revoke all on function public.platform_delete_company(uuid) from public, anon, authenticated;
grant execute on function public.platform_delete_company(uuid) to service_role;
