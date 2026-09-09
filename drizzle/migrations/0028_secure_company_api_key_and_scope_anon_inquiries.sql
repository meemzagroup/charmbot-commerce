-- Fix 1: companies_api_key_exposed_to_members
-- All real keys live in the backend-only company_secrets table and legacy
-- companies.api_key values were cleared. Revoke column-level SELECT on the
-- legacy api_key column so tenant members can never read a credential through
-- the "Members read own company" SELECT policy (column privileges override the
-- table-level SELECT grant).
REVOKE SELECT (api_key) ON public.companies FROM anon;
REVOKE SELECT (api_key) ON public.companies FROM authenticated;

-- Fix 2: leads_inquiries_anon_insert_no_company_scope
-- Helper returning the default (first) company for anonymous visitor
-- submissions. SECURITY INVOKER would fail for anon (no SELECT on companies),
-- so use SECURITY DEFINER with a fixed search_path.
CREATE OR REPLACE FUNCTION public.default_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.companies ORDER BY created_at LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.default_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.default_company_id() FROM anon;
REVOKE ALL ON FUNCTION public.default_company_id() FROM authenticated;

-- Anonymous visitors must never control the tenant their inquiry lands in:
-- when there is no authenticated user, force company_id to the default company
-- regardless of what the client submitted.
CREATE OR REPLACE FUNCTION public.set_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    NEW.company_id := public.default_company_id();
  ELSIF NEW.company_id IS NULL THEN
    NEW.company_id := (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Defense in depth: after the trigger normalizes the row, only allow anonymous
-- inserts whose company_id matches the default company.
DROP POLICY IF EXISTS "Visitors can submit inquiries" ON public.leads_inquiries;
CREATE POLICY "Visitors can submit inquiries"
ON public.leads_inquiries
FOR INSERT
TO anon
WITH CHECK (
  company_id = public.default_company_id()
  AND customer_id IS NULL
  AND status = 'Open'
  AND inquiry_type IN ('General', 'Pricing', 'Bulk Order', 'Product Question', 'Support', 'Feedback')
  AND source IN ('Website', 'Chatbot', 'Web Chat')
  AND (phone IS NOT NULL OR email IS NOT NULL)
  AND (name IS NULL OR (char_length(name) >= 1 AND char_length(name) <= 200))
  AND (phone IS NULL OR (char_length(phone) >= 5 AND char_length(phone) <= 50))
  AND (email IS NULL OR (char_length(email) <= 320 AND POSITION('@' IN email) > 1))
  AND (message IS NULL OR char_length(message) <= 5000)
);