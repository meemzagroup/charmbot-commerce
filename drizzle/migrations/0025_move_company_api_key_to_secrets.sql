-- Move the company API key out of the member-readable companies table.
CREATE TABLE IF NOT EXISTS public.company_secrets (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_secrets_api_key_key ON public.company_secrets (api_key);

INSERT INTO public.company_secrets (company_id, api_key)
SELECT c.id, c.api_key FROM public.companies c
WHERE c.api_key IS NOT NULL
ON CONFLICT (company_id) DO NOTHING;

-- No client role may ever read this table; server-side only.
REVOKE ALL ON public.company_secrets FROM anon, authenticated;
GRANT ALL ON public.company_secrets TO service_role;
ALTER TABLE public.company_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client access to company secrets" ON public.company_secrets;
CREATE POLICY "No client access to company secrets" ON public.company_secrets
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Re-assert that clients can only read non-secret company columns.
REVOKE SELECT ON public.companies FROM anon, authenticated;
GRANT SELECT (id, name, created_at, company_code) ON public.companies TO authenticated;
