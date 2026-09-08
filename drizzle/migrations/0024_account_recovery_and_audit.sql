-- 1. Recovery identifiers on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS mobile_number text,
  ADD COLUMN IF NOT EXISTS must_reset_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS company_code text;

CREATE UNIQUE INDEX IF NOT EXISTS companies_company_code_key
  ON public.companies (lower(company_code)) WHERE company_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_employee_id_idx ON public.profiles (lower(employee_id));
CREATE INDEX IF NOT EXISTS profiles_mobile_number_idx ON public.profiles (mobile_number);

-- Users must not be able to self-edit recovery identifiers or the forced-reset flag.
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
    NEW.employee_id := OLD.employee_id;
    NEW.mobile_number := OLD.mobile_number;
    NEW.must_reset_password := OLD.must_reset_password;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_profile_privileged_fields() FROM PUBLIC, anon, authenticated;

-- 2. Security / audit log
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_logs_company_idx
  ON public.security_audit_logs (company_id, created_at DESC);

GRANT SELECT ON public.security_audit_logs TO authenticated;
GRANT ALL ON public.security_audit_logs TO service_role;

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit logs in their tenant" ON public.security_audit_logs;
CREATE POLICY "Admins read audit logs in their tenant"
ON public.security_audit_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_super_admin
        OR (
          p.company_id IS NOT NULL
          AND p.company_id = security_audit_logs.company_id
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::public.app_role
          )
        )
      )
  )
);

-- 3. Abuse protection for recovery flows (server-side only)
CREATE TABLE IF NOT EXISTS public.recovery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  identifier text NOT NULL,
  ip_address text,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recovery_attempts_lookup_idx
  ON public.recovery_attempts (kind, identifier, created_at DESC);

GRANT ALL ON public.recovery_attempts TO service_role;

ALTER TABLE public.recovery_attempts ENABLE ROW LEVEL SECURITY;
