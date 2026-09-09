-- Tenant-scoped company administration for every core CRM resource.
DROP POLICY IF EXISTS "Company admins manage customers" ON public.customers;
CREATE POLICY "Company admins manage customers" ON public.customers FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

DROP POLICY IF EXISTS "Company admins manage orders" ON public.orders;
CREATE POLICY "Company admins manage orders" ON public.orders FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

DROP POLICY IF EXISTS "Company admins manage inquiries" ON public.leads_inquiries;
CREATE POLICY "Company admins manage inquiries" ON public.leads_inquiries FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

DROP POLICY IF EXISTS "Company admins manage team members" ON public.team_members;
CREATE POLICY "Company admins manage team members" ON public.team_members FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

-- Rewrite communication policies so their tenant boundary is explicit as well as restrictive.
DROP POLICY IF EXISTS "Company admins manage threads" ON public.communication_threads;
CREATE POLICY "Company admins manage threads" ON public.communication_threads FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

DROP POLICY IF EXISTS "Company admins manage messages" ON public.messages;
CREATE POLICY "Company admins manage messages" ON public.messages FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

DROP POLICY IF EXISTS "Company admins manage call logs" ON public.call_logs;
CREATE POLICY "Company admins manage call logs" ON public.call_logs FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

DROP POLICY IF EXISTS "Company admins manage whatsapp channels" ON public.whatsapp_channels;
CREATE POLICY "Company admins manage whatsapp channels" ON public.whatsapp_channels FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

DROP POLICY IF EXISTS "Company admins manage order items" ON public.order_items;
CREATE POLICY "Company admins manage order items" ON public.order_items FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND o.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND o.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
));

-- Company admins may route threads only inside their own tenant; agents remain unable to reroute.
CREATE OR REPLACE FUNCTION public.protect_thread_routing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
  THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.channel_number IS DISTINCT FROM OLD.channel_number THEN
      RAISE EXCEPTION 'Only a company administrator can change thread assignment or channel routing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_thread_routing() FROM PUBLIC, anon, authenticated;

-- Enforce package caps from tenant-derived company_id at the database boundary.
CREATE OR REPLACE FUNCTION public.enforce_company_resource_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  limit_key text;
  allowed integer;
  used integer;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  cid := COALESCE(NEW.company_id, (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
  IF cid IS NULL THEN RAISE EXCEPTION 'Account is not assigned to a company'; END IF;

  IF TG_TABLE_NAME = 'customers' THEN
    limit_key := 'max_customers';
    SELECT count(*) INTO used FROM public.customers WHERE company_id = cid;
  ELSIF TG_TABLE_NAME = 'orders' THEN
    limit_key := 'max_orders';
    SELECT count(*) INTO used FROM public.orders WHERE company_id = cid;
  ELSIF TG_TABLE_NAME = 'whatsapp_campaigns' THEN
    limit_key := 'max_campaigns_per_month';
    SELECT count(*) INTO used FROM public.whatsapp_campaigns
      WHERE company_id = cid AND created_at >= date_trunc('month', now());
  ELSE
    RETURN NEW;
  END IF;

  allowed := public.company_limit(cid, limit_key);
  IF allowed IS NOT NULL AND used >= allowed THEN
    RAISE EXCEPTION 'Subscription limit reached for % (%). Upgrade required.', replace(limit_key, '_', ' '), allowed;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_company_resource_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customers_resource_limit_guard ON public.customers;
CREATE TRIGGER customers_resource_limit_guard BEFORE INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_resource_limit();
DROP TRIGGER IF EXISTS orders_resource_limit_guard ON public.orders;
CREATE TRIGGER orders_resource_limit_guard BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_resource_limit();
DROP TRIGGER IF EXISTS campaigns_resource_limit_guard ON public.whatsapp_campaigns;
CREATE TRIGGER campaigns_resource_limit_guard BEFORE INSERT ON public.whatsapp_campaigns
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_resource_limit();