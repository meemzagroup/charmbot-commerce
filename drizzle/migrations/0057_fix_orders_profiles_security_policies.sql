
-- 1) Orders: replace the RESTRICTIVE write policy whose USING was 'true'
--    with an explicit tenant/actor-scoped USING so UPDATE/DELETE row
--    targeting is gated, not just WITH CHECK.
DROP POLICY IF EXISTS "Write scope orders" ON public.orders;
CREATE POLICY "Write scope orders" ON public.orders
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
  OR assigned_to IN (
    SELECT tm.id FROM public.team_members tm
    WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
  OR assigned_to IN (
    SELECT tm.id FROM public.team_members tm
    WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id
  )
);

-- 2) Profiles: explicit tenant-scoped read policy so same-company staff can
--    see co-worker profiles (as team_members joins assume), while
--    cross-tenant reads stay impossible.
DROP POLICY IF EXISTS "Company members read tenant profiles" ON public.profiles;
CREATE POLICY "Company members read tenant profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
);
