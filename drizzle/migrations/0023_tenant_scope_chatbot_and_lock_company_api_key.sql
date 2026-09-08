-- 1) Company API key must never be readable by client roles.
REVOKE ALL (api_key) ON public.companies FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.companies FROM anon, authenticated;
GRANT SELECT (id, name, created_at) ON public.companies TO authenticated;

-- Make the read policy explicit about membership and never expose other tenants.
DROP POLICY IF EXISTS "Members read own company" ON public.companies;
CREATE POLICY "Members read own company"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- 2) Chatbot conversations: give tenant staff explicitly company-scoped access
--    so no future broad policy is needed, and add a restrictive guard that
--    forces every row touched to match the caller's company.
CREATE POLICY "Tenant staff read chatbot conversations"
  ON public.chatbot_conversations
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'store_manager')
      OR public.has_role(auth.uid(), 'support_agent')
    )
  );

CREATE POLICY "Tenant staff update chatbot conversations"
  ON public.chatbot_conversations
  FOR UPDATE
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'store_manager')
    )
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Restrictive backstop: any current or future permissive policy is still
-- confined to the caller's own company.
DROP POLICY IF EXISTS "Chatbot conversations tenant guard" ON public.chatbot_conversations;
CREATE POLICY "Chatbot conversations tenant guard"
  ON public.chatbot_conversations
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );
