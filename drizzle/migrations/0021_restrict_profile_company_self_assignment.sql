-- Prevent self-registering users from joining the oldest company implicitly.
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

-- The default-company trigger must not grant tenant membership to
-- self-service inserts; only privileged/server-side creation may default.
CREATE OR REPLACE FUNCTION public.set_profile_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.company_id IS NULL AND current_user NOT IN ('anon', 'authenticated') THEN
    NEW.company_id := (SELECT c.id FROM public.companies c ORDER BY c.created_at LIMIT 1);
  END IF;
  RETURN NEW;
END;
$function$;
