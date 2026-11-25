DROP POLICY IF EXISTS "packages readable by authenticated" ON public.subscription_packages;
CREATE POLICY "packages readable by own company or owner" ON public.subscription_packages
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR id = (SELECT c.package_id FROM public.companies c WHERE c.id = public.current_company_id())
);