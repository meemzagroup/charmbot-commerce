-- Only users explicitly granted a staff role may access CRM data.
-- Signup no longer auto-grants a role, so a mere authenticated account has no access.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  -- Bootstrap: the very first account becomes admin. All later accounts get
  -- no role and therefore no access until an admin grants one.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- app_settings: admins only
DROP POLICY IF EXISTS "Staff manage settings" ON public.app_settings;
CREATE POLICY "Admins manage settings" ON public.app_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- call_logs
DROP POLICY IF EXISTS "Staff manage call logs" ON public.call_logs;
CREATE POLICY "Privileged staff manage call logs" ON public.call_logs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));

-- chatbot_conversations
DROP POLICY IF EXISTS "Staff manage conversations" ON public.chatbot_conversations;
CREATE POLICY "Privileged staff manage conversations" ON public.chatbot_conversations FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));

-- communication_threads
DROP POLICY IF EXISTS "Staff manage threads" ON public.communication_threads;
CREATE POLICY "Privileged staff manage threads" ON public.communication_threads FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));

-- customers
DROP POLICY IF EXISTS "Staff manage customers" ON public.customers;
CREATE POLICY "Privileged staff manage customers" ON public.customers FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));

-- leads_inquiries
DROP POLICY IF EXISTS "Staff manage inquiries" ON public.leads_inquiries;
CREATE POLICY "Privileged staff manage inquiries" ON public.leads_inquiries FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));

-- messages
DROP POLICY IF EXISTS "Staff manage messages" ON public.messages;
CREATE POLICY "Privileged staff manage messages" ON public.messages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));

-- order_items
DROP POLICY IF EXISTS "Staff manage order items" ON public.order_items;
CREATE POLICY "Privileged staff manage order items" ON public.order_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));

-- orders
DROP POLICY IF EXISTS "Staff manage orders" ON public.orders;
CREATE POLICY "Privileged staff manage orders" ON public.orders FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));

-- products: reads for staff, writes for admin/store_manager only
DROP POLICY IF EXISTS "Authenticated read products" ON public.products;
DROP POLICY IF EXISTS "Staff insert products" ON public.products;
DROP POLICY IF EXISTS "Staff update products" ON public.products;
DROP POLICY IF EXISTS "Staff delete products" ON public.products;
CREATE POLICY "Staff read products" ON public.products FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));
CREATE POLICY "Managers insert products" ON public.products FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager')));
CREATE POLICY "Managers update products" ON public.products FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager')));
CREATE POLICY "Managers delete products" ON public.products FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager')));

-- team_members: staff read, admins/managers write
DROP POLICY IF EXISTS "Staff manage team members" ON public.team_members;
CREATE POLICY "Staff read team members" ON public.team_members FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager','support_agent')));
CREATE POLICY "Managers insert team members" ON public.team_members FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager')));
CREATE POLICY "Managers update team members" ON public.team_members FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager')))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager')));
CREATE POLICY "Managers delete team members" ON public.team_members FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','store_manager')));
