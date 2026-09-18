-- Sensitive HR data (salary, exit, letters, disciplinary) must not be readable by all staff.
DROP POLICY IF EXISTS "Company members read employee_records" ON public.employee_records;
CREATE POLICY "HR admins or own employee record read"
ON public.employee_records FOR SELECT TO authenticated
USING (
  company_id = public.current_company_id()
  AND (public.is_company_admin(auth.uid()) OR public.is_own_team_member(team_member_id))
);

DROP POLICY IF EXISTS "Company members read hr_letters" ON public.hr_letters;
CREATE POLICY "HR admins or own hr_letters read"
ON public.hr_letters FOR SELECT TO authenticated
USING (
  company_id = public.current_company_id()
  AND (public.is_company_admin(auth.uid()) OR public.is_own_team_member(team_member_id))
);

DROP POLICY IF EXISTS "Company members read performance_actions" ON public.performance_actions;
CREATE POLICY "HR admins or own performance_actions read"
ON public.performance_actions FOR SELECT TO authenticated
USING (
  company_id = public.current_company_id()
  AND (public.is_company_admin(auth.uid()) OR public.is_own_team_member(team_member_id))
);
