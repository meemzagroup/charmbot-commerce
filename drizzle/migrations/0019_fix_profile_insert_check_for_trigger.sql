DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND is_super_admin = false
  AND (
    company_id IS NULL
    -- company_id may only be the server-assigned default set by the
    -- profiles_set_company trigger, never a client-chosen tenant.
    OR company_id = (SELECT c.id FROM public.companies c ORDER BY c.created_at LIMIT 1)
  )
);
