-- 1. SECURITY DEFINER functions must not be callable by app roles through the Data API.
--    These are used either as triggers (no EXECUTE needed) or from trusted server code
--    running as service_role. No RLS policy references them.
REVOKE ALL ON FUNCTION public.company_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_subscription_active(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_limit(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_module_enabled(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_subscription_active() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_channel_limit() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.company_plan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.company_subscription_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.company_limit(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.company_module_enabled(uuid, text) TO service_role;

-- 2. Legacy companies.api_key must never hold or emit a secret again.
--    Real integration keys live in the backend-only company_secrets table.
ALTER TABLE public.companies ALTER COLUMN api_key SET DEFAULT '';

REVOKE SELECT (api_key) ON public.companies FROM anon, authenticated;
REVOKE INSERT (api_key), UPDATE (api_key) ON public.companies FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.block_company_api_key_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The legacy column is deprecated: force it empty no matter who writes.
  NEW.api_key := '';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_company_api_key_writes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS companies_block_api_key ON public.companies;
CREATE TRIGGER companies_block_api_key
BEFORE INSERT OR UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.block_company_api_key_writes();