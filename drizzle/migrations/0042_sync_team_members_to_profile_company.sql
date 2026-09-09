CREATE OR REPLACE FUNCTION public.sync_team_member_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.team_members
  SET user_id = NEW.id,
      company_id = NEW.company_id,
      full_name = COALESCE(NEW.full_name, team_members.full_name),
      email = COALESCE(NEW.email, team_members.email)
  WHERE (user_id = NEW.id)
     OR (user_id IS NULL AND NEW.email IS NOT NULL AND lower(email) = lower(NEW.email));

  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.id) THEN
    INSERT INTO public.team_members (user_id, company_id, full_name, email, role_title, is_active)
    VALUES (
      NEW.id,
      NEW.company_id,
      COALESCE(NEW.full_name, split_part(COALESCE(NEW.email,'user'),'@',1)),
      NEW.email,
      'Agent',
      NEW.status = 'Active'
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_team_member_for_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_team_member ON public.profiles;
CREATE TRIGGER profiles_sync_team_member
AFTER INSERT OR UPDATE OF company_id, full_name, email, status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_for_profile();

UPDATE public.team_members tm
SET company_id = p.company_id,
    is_active = (p.status = 'Active')
FROM public.profiles p
WHERE tm.user_id = p.id
  AND (tm.company_id IS DISTINCT FROM p.company_id OR tm.is_active IS DISTINCT FROM (p.status = 'Active'));