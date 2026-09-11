-- The tenant profile read policy queried public.profiles from within a profiles
-- policy, causing infinite recursion and failing every profile read.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;

DROP POLICY IF EXISTS "Company members read tenant profiles" ON public.profiles;

CREATE POLICY "Company admins read tenant profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = public.current_company_id()
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  )
);
