-- set_crm_company_id evaluates NEW.thread_id in a single boolean expression, which
-- Postgres resolves even for tables without that column (team_members), breaking
-- signup with: record "new" has no field "thread_id". Use nested IFs instead.
CREATE OR REPLACE FUNCTION public.set_crm_company_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.company_id IS NULL THEN
    IF TG_TABLE_NAME IN ('messages', 'call_logs') THEN
      IF NEW.thread_id IS NOT NULL THEN
        NEW.company_id := (SELECT t.company_id FROM public.communication_threads t WHERE t.id = NEW.thread_id);
      END IF;
    ELSE
      NEW.company_id := (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Restore the original signup handler (diagnostic version swallowed errors).
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;