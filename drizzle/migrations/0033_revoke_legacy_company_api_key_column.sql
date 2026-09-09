REVOKE ALL (api_key) ON public.companies FROM PUBLIC;
REVOKE ALL (api_key) ON public.companies FROM anon;
REVOKE ALL (api_key) ON public.companies FROM authenticated;

COMMENT ON COLUMN public.companies.api_key IS 'DEPRECATED legacy column. Always empty; integration keys live in public.company_secrets (service_role only). No app-role privileges.';