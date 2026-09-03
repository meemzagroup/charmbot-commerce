-- 1. Link team members to auth users -------------------------------------
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.team_members tm
SET user_id = p.id
FROM public.profiles p
WHERE tm.user_id IS NULL AND p.email IS NOT NULL AND lower(p.email) = lower(tm.email);

INSERT INTO public.team_members (user_id, full_name, email, role_title, is_active)
SELECT p.id, COALESCE(p.full_name, split_part(COALESCE(p.email,'user'),'@',1)), p.email, 'Agent', true
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.user_id = p.id);

-- keep a team member row for every new account
CREATE OR REPLACE FUNCTION public.sync_team_member_for_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.team_members SET user_id = NEW.id
  WHERE user_id IS NULL AND NEW.email IS NOT NULL AND lower(email) = lower(NEW.email);

  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.id) THEN
    INSERT INTO public.team_members (user_id, full_name, email, role_title, is_active)
    VALUES (NEW.id, COALESCE(NEW.full_name, split_part(COALESCE(NEW.email,'user'),'@',1)), NEW.email, 'Agent', true);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_team_member_for_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_team_member ON public.profiles;
CREATE TRIGGER profiles_sync_team_member
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_for_profile();

-- 2. Ownership columns -----------------------------------------------------
ALTER TABLE public.customers       ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.team_members(id) ON DELETE SET NULL;
ALTER TABLE public.orders          ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.team_members(id) ON DELETE SET NULL;
ALTER TABLE public.leads_inquiries ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.team_members(id) ON DELETE SET NULL;

-- 3. Rebuild policies with strict per-user isolation ------------------------
-- app_settings: super admin only
DROP POLICY IF EXISTS "Admins manage settings" ON public.app_settings;
DROP POLICY IF EXISTS "Super admin manages settings" ON public.app_settings;
CREATE POLICY "Super admin manages settings" ON public.app_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

-- team_members
DROP POLICY IF EXISTS "Privileged staff manage team members" ON public.team_members;
DROP POLICY IF EXISTS "Staff read team members" ON public.team_members;
DROP POLICY IF EXISTS "Members read own record" ON public.team_members;
DROP POLICY IF EXISTS "Super admin manages team members" ON public.team_members;
CREATE POLICY "Members read own record" ON public.team_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));
CREATE POLICY "Super admin manages team members" ON public.team_members FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

-- whatsapp_channels: super admin manages, assigned member reads own channel
DROP POLICY IF EXISTS "Privileged staff manage whatsapp channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "Admins manage whatsapp channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "Assigned member reads own channel" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "Super admin manages whatsapp channels" ON public.whatsapp_channels;
CREATE POLICY "Assigned member reads own channel" ON public.whatsapp_channels FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR team_member_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);
CREATE POLICY "Super admin manages whatsapp channels" ON public.whatsapp_channels FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

-- communication_threads
DROP POLICY IF EXISTS "Privileged staff manage threads" ON public.communication_threads;
DROP POLICY IF EXISTS "Owner scoped threads" ON public.communication_threads;
CREATE POLICY "Owner scoped threads" ON public.communication_threads FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR (channel_number IS NOT NULL AND channel_number IN (
        SELECT wc.phone_number FROM public.whatsapp_channels wc
        JOIN public.team_members tm ON tm.id = wc.team_member_id
        WHERE tm.user_id = auth.uid()))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR (channel_number IS NOT NULL AND channel_number IN (
        SELECT wc.phone_number FROM public.whatsapp_channels wc
        JOIN public.team_members tm ON tm.id = wc.team_member_id
        WHERE tm.user_id = auth.uid()))
);

-- messages follow thread visibility (RLS applies to the sub-select)
DROP POLICY IF EXISTS "Privileged staff manage messages" ON public.messages;
DROP POLICY IF EXISTS "Messages follow thread access" ON public.messages;
CREATE POLICY "Messages follow thread access" ON public.messages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.communication_threads t WHERE t.id = messages.thread_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.communication_threads t WHERE t.id = messages.thread_id));

-- call logs
DROP POLICY IF EXISTS "Privileged staff manage call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Owner scoped call logs" ON public.call_logs;
CREATE POLICY "Owner scoped call logs" ON public.call_logs FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.communication_threads t WHERE t.id = call_logs.thread_id)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.communication_threads t WHERE t.id = call_logs.thread_id)
);

-- customers
DROP POLICY IF EXISTS "Privileged staff manage customers" ON public.customers;
DROP POLICY IF EXISTS "Owner scoped customers" ON public.customers;
CREATE POLICY "Owner scoped customers" ON public.customers FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.communication_threads t WHERE t.contact_id = customers.id)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

-- orders
DROP POLICY IF EXISTS "Privileged staff manage orders" ON public.orders;
DROP POLICY IF EXISTS "Owner scoped orders" ON public.orders;
CREATE POLICY "Owner scoped orders" ON public.orders FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

-- order items follow order visibility
DROP POLICY IF EXISTS "Privileged staff manage order items" ON public.order_items;
DROP POLICY IF EXISTS "Staff insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Order items follow order access" ON public.order_items;
CREATE POLICY "Order items follow order access" ON public.order_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id));

-- leads / inquiries
DROP POLICY IF EXISTS "Privileged staff manage inquiries" ON public.leads_inquiries;
DROP POLICY IF EXISTS "Owner scoped inquiries" ON public.leads_inquiries;
CREATE POLICY "Owner scoped inquiries" ON public.leads_inquiries FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

-- chatbot conversations: super admin only (anon insert policy preserved)
DROP POLICY IF EXISTS "Privileged staff manage conversations" ON public.chatbot_conversations;
DROP POLICY IF EXISTS "Super admin reads conversations" ON public.chatbot_conversations;
CREATE POLICY "Super admin reads conversations" ON public.chatbot_conversations FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

-- products: shared catalogue, super admin writes
DROP POLICY IF EXISTS "Privileged staff manage products" ON public.products;
DROP POLICY IF EXISTS "Staff read products" ON public.products;
DROP POLICY IF EXISTS "Super admin manages products" ON public.products;
CREATE POLICY "Staff read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manages products" ON public.products FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;