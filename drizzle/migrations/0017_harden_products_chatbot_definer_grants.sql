-- 1) Remove anonymous PII writes to chatbot_conversations (app writes via server admin client)
DROP POLICY IF EXISTS "Visitors can submit chatbot conversations" ON public.chatbot_conversations;
REVOKE ALL ON public.chatbot_conversations FROM anon;

-- 2) Scope product reads to the caller's company (no more USING (true))
DROP POLICY IF EXISTS "Company staff read products" ON public.products;
CREATE POLICY "Company staff read own company products"
ON public.products FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- 3) Bake tenant scoping directly into role-based product write policies
DROP POLICY IF EXISTS "Inventory managers write products" ON public.products;
CREATE POLICY "Inventory managers write products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager')
  )
);

DROP POLICY IF EXISTS "Inventory managers update products" ON public.products;
CREATE POLICY "Inventory managers update products"
ON public.products FOR UPDATE TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager')
  )
)
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager')
  )
);

DROP POLICY IF EXISTS "Inventory managers delete products" ON public.products;
CREATE POLICY "Inventory managers delete products"
ON public.products FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager')
  )
);

-- 4) Revoke direct EXECUTE on SECURITY DEFINER trigger helpers (triggers still run them)
REVOKE ALL ON FUNCTION public.set_company_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_profile_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_crm_company_id() FROM PUBLIC, anon, authenticated;
