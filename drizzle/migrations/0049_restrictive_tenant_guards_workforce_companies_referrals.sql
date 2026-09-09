DROP POLICY IF EXISTS "Tenant scope companies" ON public.companies;
CREATE POLICY "Tenant scope companies"
  ON public.companies
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employee_records','employee_documents','hr_letters','attendance_records',
    'incentive_payouts','incentive_rules','performance_actions','collections',
    'territories','customer_allocations','journey_plans','visits',
    'trainings','training_assignments','job_openings','job_applications',
    'competitor_intel','system_alerts','workforce_audit_logs',
    'sales_targets','target_recovery_plans'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Tenant guard ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())) '
      || 'WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))',
      'Tenant guard ' || t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Anyone signed in reads program settings" ON public.referral_program_settings;
DROP POLICY IF EXISTS "No direct access to referral program settings" ON public.referral_program_settings;
CREATE POLICY "No direct access to referral program settings"
  ON public.referral_program_settings
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.referral_program_settings FROM anon, authenticated;
GRANT ALL ON public.referral_program_settings TO service_role;