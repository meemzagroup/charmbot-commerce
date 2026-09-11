-- Helper: company admin or platform owner
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.is_super_admin);
$$;

REVOKE ALL ON FUNCTION public.is_company_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid) TO authenticated, service_role;

-- Helper: is the given team_member row the caller's own record
CREATE OR REPLACE FUNCTION public.is_own_team_member(_team_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.id = _team_member_id AND tm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_own_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_team_member(uuid) TO authenticated, service_role;

-- attendance_records: own record or admin
DROP POLICY IF EXISTS "Company members write attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "Company members update attendance_records" ON public.attendance_records;

CREATE POLICY "Own or admin insert attendance_records"
ON public.attendance_records FOR INSERT TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND (public.is_company_admin(auth.uid()) OR public.is_own_team_member(team_member_id))
);

CREATE POLICY "Own or admin update attendance_records"
ON public.attendance_records FOR UPDATE TO authenticated
USING (
  company_id = public.current_company_id()
  AND (public.is_company_admin(auth.uid()) OR public.is_own_team_member(team_member_id))
)
WITH CHECK (
  company_id = public.current_company_id()
  AND (public.is_company_admin(auth.uid()) OR public.is_own_team_member(team_member_id))
);

-- collections: admin only writes
DROP POLICY IF EXISTS "Company members write collections" ON public.collections;
DROP POLICY IF EXISTS "Company members update collections" ON public.collections;

CREATE POLICY "Company admins insert collections"
ON public.collections FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

CREATE POLICY "Company admins update collections"
ON public.collections FOR UPDATE TO authenticated
USING (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()))
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

-- employee_records: admin only writes
DROP POLICY IF EXISTS "Company members write employee_records" ON public.employee_records;
DROP POLICY IF EXISTS "Company members update employee_records" ON public.employee_records;

CREATE POLICY "Company admins insert employee_records"
ON public.employee_records FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

CREATE POLICY "Company admins update employee_records"
ON public.employee_records FOR UPDATE TO authenticated
USING (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()))
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

-- hr_letters: admin only writes
DROP POLICY IF EXISTS "Company members write hr_letters" ON public.hr_letters;
DROP POLICY IF EXISTS "Company members update hr_letters" ON public.hr_letters;

CREATE POLICY "Company admins insert hr_letters"
ON public.hr_letters FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

CREATE POLICY "Company admins update hr_letters"
ON public.hr_letters FOR UPDATE TO authenticated
USING (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()))
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

-- incentive_payouts: admin only writes
DROP POLICY IF EXISTS "Company members write incentive_payouts" ON public.incentive_payouts;
DROP POLICY IF EXISTS "Company members update incentive_payouts" ON public.incentive_payouts;

CREATE POLICY "Company admins insert incentive_payouts"
ON public.incentive_payouts FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

CREATE POLICY "Company admins update incentive_payouts"
ON public.incentive_payouts FOR UPDATE TO authenticated
USING (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()))
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

-- job_applications: admin only updates (scores/decisions); inserts stay company-scoped
DROP POLICY IF EXISTS "Company members update job_applications" ON public.job_applications;

CREATE POLICY "Company admins update job_applications"
ON public.job_applications FOR UPDATE TO authenticated
USING (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()))
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

-- performance_actions: admin only writes
DROP POLICY IF EXISTS "Company members write performance_actions" ON public.performance_actions;
DROP POLICY IF EXISTS "Company members update performance_actions" ON public.performance_actions;

CREATE POLICY "Company admins insert performance_actions"
ON public.performance_actions FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

CREATE POLICY "Company admins update performance_actions"
ON public.performance_actions FOR UPDATE TO authenticated
USING (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()))
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

-- system_alerts: admin only writes
DROP POLICY IF EXISTS "Company members write system_alerts" ON public.system_alerts;
DROP POLICY IF EXISTS "Company members update system_alerts" ON public.system_alerts;

CREATE POLICY "Company admins insert system_alerts"
ON public.system_alerts FOR INSERT TO authenticated
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

CREATE POLICY "Company admins update system_alerts"
ON public.system_alerts FOR UPDATE TO authenticated
USING (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()))
WITH CHECK (company_id = public.current_company_id() AND public.is_company_admin(auth.uid()));

-- target_recovery_plans: explicit ownership-scoped UPDATE mirroring INSERT
DROP POLICY IF EXISTS "Members update own recovery plans" ON public.target_recovery_plans;

CREATE POLICY "Members update own recovery plans"
ON public.target_recovery_plans FOR UPDATE TO authenticated
USING (
  company_id = public.current_company_id()
  AND (public.is_company_admin(auth.uid()) OR public.is_own_team_member(team_member_id))
)
WITH CHECK (
  company_id = public.current_company_id()
  AND (public.is_company_admin(auth.uid()) OR public.is_own_team_member(team_member_id))
);