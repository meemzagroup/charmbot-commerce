-- 1. Lock down SECURITY DEFINER functions from API roles
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- 2. user_roles: no client writes at all (roles assigned by trigger only)
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 3. Staff-only policies (staff = user having a row in user_roles)
DROP POLICY IF EXISTS "Staff manage settings" ON public.app_settings;
CREATE POLICY "Staff manage settings" ON public.app_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "Staff read conversations" ON public.chatbot_conversations;
CREATE POLICY "Staff manage conversations" ON public.chatbot_conversations FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "Staff manage customers" ON public.customers;
CREATE POLICY "Staff manage customers" ON public.customers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "Staff manage inquiries" ON public.leads_inquiries;
CREATE POLICY "Staff manage inquiries" ON public.leads_inquiries FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "Staff manage orders" ON public.orders;
CREATE POLICY "Staff manage orders" ON public.orders FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "Staff manage order items" ON public.order_items;
CREATE POLICY "Staff manage order items" ON public.order_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- 4. products: everyone signed in may read, staff only may write
DROP POLICY IF EXISTS "Staff manage products" ON public.products;
CREATE POLICY "Authenticated read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff insert products" ON public.products FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
CREATE POLICY "Staff update products" ON public.products FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
CREATE POLICY "Staff delete products" ON public.products FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- 5. profiles: users see only their own profile
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);