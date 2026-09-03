-- Close remaining cross-tenant access paths and enforce Super Admin-only routing changes.

DROP POLICY IF EXISTS "Owner scoped call logs" ON public.call_logs;
CREATE POLICY "Owner scoped call logs"
ON public.call_logs
FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.communication_threads t
    WHERE t.id = call_logs.thread_id
      AND (
        public.is_super_admin(auth.uid())
        OR t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
        OR (
          t.channel_number IS NOT NULL
          AND t.channel_number IN (
            SELECT wc.phone_number
            FROM public.whatsapp_channels wc
            JOIN public.team_members tm ON tm.id = wc.team_member_id
            WHERE tm.user_id = auth.uid()
          )
        )
      )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.communication_threads t
    WHERE t.id = call_logs.thread_id
      AND (
        public.is_super_admin(auth.uid())
        OR t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
        OR (
          t.channel_number IS NOT NULL
          AND t.channel_number IN (
            SELECT wc.phone_number
            FROM public.whatsapp_channels wc
            JOIN public.team_members tm ON tm.id = wc.team_member_id
            WHERE tm.user_id = auth.uid()
          )
        )
      )
  )
);

DROP POLICY IF EXISTS "Owner scoped customers" ON public.customers;
CREATE POLICY "Owner scoped customers"
ON public.customers
FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.communication_threads t
    WHERE t.contact_id = customers.id
      AND (
        public.is_super_admin(auth.uid())
        OR t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
        OR (
          t.channel_number IS NOT NULL
          AND t.channel_number IN (
            SELECT wc.phone_number
            FROM public.whatsapp_channels wc
            JOIN public.team_members tm ON tm.id = wc.team_member_id
            WHERE tm.user_id = auth.uid()
          )
        )
      )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Owner scoped threads" ON public.communication_threads;
CREATE POLICY "Staff read assigned threads"
ON public.communication_threads
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR (
    channel_number IS NOT NULL
    AND channel_number IN (
      SELECT wc.phone_number
      FROM public.whatsapp_channels wc
      JOIN public.team_members tm ON tm.id = wc.team_member_id
      WHERE tm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Staff create assigned threads"
ON public.communication_threads
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR (
    channel_number IS NOT NULL
    AND channel_number IN (
      SELECT wc.phone_number
      FROM public.whatsapp_channels wc
      JOIN public.team_members tm ON tm.id = wc.team_member_id
      WHERE tm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Staff update assigned threads"
ON public.communication_threads
FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR (
    channel_number IS NOT NULL
    AND channel_number IN (
      SELECT wc.phone_number
      FROM public.whatsapp_channels wc
      JOIN public.team_members tm ON tm.id = wc.team_member_id
      WHERE tm.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR (
    channel_number IS NOT NULL
    AND channel_number IN (
      SELECT wc.phone_number
      FROM public.whatsapp_channels wc
      JOIN public.team_members tm ON tm.id = wc.team_member_id
      WHERE tm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Super Admin deletes threads"
ON public.communication_threads
FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Order items follow order access" ON public.order_items;
DROP POLICY IF EXISTS "Privileged staff insert order items" ON public.order_items;
CREATE POLICY "Order items follow assigned order access"
ON public.order_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        public.is_super_admin(auth.uid())
        OR o.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        public.is_super_admin(auth.uid())
        OR o.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "Staff read products" ON public.products;
DROP POLICY IF EXISTS "Managers insert products" ON public.products;
DROP POLICY IF EXISTS "Managers update products" ON public.products;
DROP POLICY IF EXISTS "Managers delete products" ON public.products;
DROP POLICY IF EXISTS "Super admin manages products" ON public.products;
CREATE POLICY "Super Admin manages products"
ON public.products
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Managers insert team members" ON public.team_members;
DROP POLICY IF EXISTS "Managers update team members" ON public.team_members;
DROP POLICY IF EXISTS "Managers delete team members" ON public.team_members;
DROP POLICY IF EXISTS "Super admin manages team members" ON public.team_members;
CREATE POLICY "Super Admin manages team members"
ON public.team_members
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff read whatsapp channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "Managers insert whatsapp channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "Managers update whatsapp channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "Managers delete whatsapp channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "Super admin manages whatsapp channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "Assigned member reads own channel" ON public.whatsapp_channels;
CREATE POLICY "Assigned member reads own channel"
ON public.whatsapp_channels
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR team_member_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);
CREATE POLICY "Super Admin manages whatsapp channels"
ON public.whatsapp_channels
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_thread_routing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_super_admin(auth.uid()) THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.channel_number IS DISTINCT FROM OLD.channel_number THEN
      RAISE EXCEPTION 'Only the Super Admin can change thread assignment or channel routing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS communication_threads_protect_routing ON public.communication_threads;
CREATE TRIGGER communication_threads_protect_routing
BEFORE UPDATE ON public.communication_threads
FOR EACH ROW EXECUTE FUNCTION public.protect_thread_routing();

REVOKE ALL ON FUNCTION public.protect_thread_routing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_thread_routing() TO service_role;
