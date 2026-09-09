-- 1) Company rows: allow tenant members to read only non-secret columns.
--    The legacy api_key column stays unreadable by app roles (secrets live in company_secrets).
REVOKE ALL ON public.companies FROM anon, authenticated;

GRANT SELECT (
  id, name, created_at, company_code, legal_name, logo_url, email, phone, whatsapp,
  address, city, state, country, timezone, currency, language, tax_id, website,
  status, package_id, subscription_start, subscription_expiry, trial_ends_at,
  owner_user_id, limit_overrides, is_archived
) ON public.companies TO authenticated;

GRANT ALL ON public.companies TO service_role;

-- 2) Public inquiry submissions no longer land in a hardcoded default tenant.
--    Visitor/chatbot inquiries are created server-side with the resolved tenant id.
DROP POLICY IF EXISTS "Visitors can submit inquiries" ON public.leads_inquiries;

REVOKE INSERT, UPDATE, DELETE, SELECT ON public.leads_inquiries FROM anon;

CREATE POLICY "Anon cannot insert inquiries"
ON public.leads_inquiries
FOR INSERT
TO anon
WITH CHECK (false);