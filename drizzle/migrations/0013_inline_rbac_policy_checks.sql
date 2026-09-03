-- Keep the security-definer functions non-executable to clients while making
-- authenticated RLS policies self-contained and functional.

DROP POLICY IF EXISTS "Owner scoped call logs" ON public.call_logs;
CREATE POLICY "Owner scoped call logs"
ON public.call_logs
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.id = call_logs.thread_id
      AND (
        (t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
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
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.id = call_logs.thread_id
      AND (
        (t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid()))
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
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.contact_id = customers.id
      AND (
        t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
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
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Staff read assigned threads" ON public.communication_threads;
CREATE POLICY "Staff read assigned threads"
ON public.communication_threads
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
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

DROP POLICY IF EXISTS "Staff create assigned threads" ON public.communication_threads;
CREATE POLICY "Staff create assigned threads"
ON public.communication_threads
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
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

DROP POLICY IF EXISTS "Staff update assigned threads" ON public.communication_threads;
CREATE POLICY "Staff update assigned threads"
ON public.communication_threads
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
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
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
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

DROP POLICY IF EXISTS "Super Admin deletes threads" ON public.communication_threads;
CREATE POLICY "Super Admin deletes threads"
ON public.communication_threads
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

DROP POLICY IF EXISTS "Order items follow assigned order access" ON public.order_items;
CREATE POLICY "Order items follow assigned order access"
ON public.order_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
        OR o.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
        OR o.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "Super Admin manages products" ON public.products;
CREATE POLICY "Super Admin manages products"
ON public.products
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

DROP POLICY IF EXISTS "Super Admin manages team members" ON public.team_members;
CREATE POLICY "Super Admin manages team members"
ON public.team_members
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

DROP POLICY IF EXISTS "Super Admin manages whatsapp channels" ON public.whatsapp_channels;
CREATE POLICY "Super Admin manages whatsapp channels"
ON public.whatsapp_channels
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin));

DROP POLICY IF EXISTS "Assigned member reads own channel" ON public.whatsapp_channels;
CREATE POLICY "Assigned member reads own channel"
ON public.whatsapp_channels
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR team_member_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.protect_thread_routing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin
  ) THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.channel_number IS DISTINCT FROM OLD.channel_number THEN
      RAISE EXCEPTION 'Only the Super Admin can change thread assignment or channel routing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_thread_routing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_thread_routing() TO service_role;
