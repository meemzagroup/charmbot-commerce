-- 1. Prevent privilege escalation via self profile updates
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.id := OLD.id;
    NEW.is_super_admin := OLD.is_super_admin;
    NEW.status := OLD.status;
    NEW.email := OLD.email;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged_fields ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Belt and braces: restrictive policy blocking self-escalation attempts
DROP POLICY IF EXISTS "Users cannot self grant super admin" ON public.profiles;
CREATE POLICY "Users cannot self grant super admin"
ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (true)
WITH CHECK (
  is_super_admin = (SELECT p.is_super_admin FROM public.profiles p WHERE p.id = profiles.id)
);

-- 2. Revoke EXECUTE on SECURITY DEFINER functions from API roles
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_thread_on_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_privileged_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO service_role;
