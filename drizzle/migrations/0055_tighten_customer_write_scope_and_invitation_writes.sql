-- 1) Customers: replace the ALL restrictive write guard (USING true) with
--    command-specific restrictive guards so UPDATE/DELETE row selection is
--    scoped, while SELECT visibility stays unchanged.
DROP POLICY IF EXISTS "Write scope customers" ON public.customers;

CREATE POLICY "Write scope customers insert" ON public.customers
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role)
  OR assigned_to IN (
    SELECT tm.id FROM public.team_members tm
    WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
  )
);

CREATE POLICY "Write scope customers update" ON public.customers
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role)
  OR assigned_to IN (
    SELECT tm.id FROM public.team_members tm
    WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role)
  OR assigned_to IN (
    SELECT tm.id FROM public.team_members tm
    WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
  )
);

CREATE POLICY "Write scope customers delete" ON public.customers
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role)
  OR assigned_to IN (
    SELECT tm.id FROM public.team_members tm
    WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
  )
);

-- 2) Invitations: invitation rows (emails + token hashes) are only ever written
--    by server-side privileged code. Make that explicit with restrictive
--    deny-write policies so no signed-in client can create or tamper with them.
DROP POLICY IF EXISTS "No client invitation inserts" ON public.invitations;
DROP POLICY IF EXISTS "No client invitation updates" ON public.invitations;
DROP POLICY IF EXISTS "No client invitation deletes" ON public.invitations;

CREATE POLICY "No client invitation inserts" ON public.invitations
AS RESTRICTIVE FOR INSERT TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "No client invitation updates" ON public.invitations
AS RESTRICTIVE FOR UPDATE TO authenticated, anon
USING (false) WITH CHECK (false);

CREATE POLICY "No client invitation deletes" ON public.invitations
AS RESTRICTIVE FOR DELETE TO authenticated, anon
USING (false);

REVOKE INSERT, UPDATE, DELETE ON public.invitations FROM authenticated;
GRANT SELECT ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
