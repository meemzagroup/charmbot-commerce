-- 1) Company API key must not be readable by ordinary company members.
REVOKE SELECT ON public.companies FROM authenticated, anon;
GRANT SELECT (id, name, created_at) ON public.companies TO authenticated;

-- 2) Prevent self-service privilege escalation on profile creation.
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND is_super_admin = false
  AND company_id IS NULL
);
