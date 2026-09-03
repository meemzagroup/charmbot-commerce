-- 1. Root cause: a user must not be able to move themselves into another tenant.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.id := OLD.id;
    NEW.is_super_admin := OLD.is_super_admin;
    NEW.status := OLD.status;
    NEW.email := OLD.email;
    NEW.created_at := OLD.created_at;
    NEW.company_id := OLD.company_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Belt and braces at the policy layer as well.
CREATE POLICY "Users cannot self reassign company"
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  company_id IS NOT DISTINCT FROM (SELECT p.company_id FROM public.profiles p WHERE p.id = profiles.id)
);

-- 2. Products: require actual staff membership in the tenant, not just a
-- matching company_id on the profile row.
DROP POLICY IF EXISTS "Tenant scope products" ON public.products;
DROP POLICY IF EXISTS "Company staff read own company products" ON public.products;

CREATE POLICY "Company staff read own company products"
ON public.products
FOR SELECT
TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid()
        AND r.role = ANY (ARRAY['admin'::app_role, 'store_manager'::app_role, 'support_agent'::app_role])
    )
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.is_active
        AND tm.company_id = products.company_id
    )
  )
);
