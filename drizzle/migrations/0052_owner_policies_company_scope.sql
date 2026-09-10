DROP POLICY IF EXISTS "Owner scoped orders" ON public.orders;
CREATE POLICY "Owner scoped orders" ON public.orders
AS PERMISSIVE FOR ALL TO authenticated
USING (
  (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  OR (assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id))
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  OR (assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id))
);

DROP POLICY IF EXISTS "Owner scoped inquiries" ON public.leads_inquiries;
CREATE POLICY "Owner scoped inquiries" ON public.leads_inquiries
AS PERMISSIVE FOR ALL TO authenticated
USING (
  (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  OR (assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = leads_inquiries.company_id))
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  OR (assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = leads_inquiries.company_id))
);

DROP POLICY IF EXISTS "Owner scoped customers" ON public.customers;
CREATE POLICY "Owner scoped customers" ON public.customers
AS PERMISSIVE FOR ALL TO authenticated
USING (
  (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  OR (assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id))
  OR (EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.contact_id = customers.id
      AND t.company_id = customers.company_id
      AND (
        t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id)
        OR (t.channel_number IS NOT NULL AND t.channel_number IN (
          SELECT wc.phone_number FROM public.whatsapp_channels wc
          JOIN public.team_members tm ON tm.id = wc.team_member_id
          WHERE tm.user_id = auth.uid() AND wc.company_id = customers.company_id AND tm.company_id = customers.company_id
        ))
      )
  ))
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  OR (assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id))
);

DROP POLICY IF EXISTS "Owner scoped call logs" ON public.call_logs;
CREATE POLICY "Owner scoped call logs" ON public.call_logs
AS PERMISSIVE FOR ALL TO authenticated
USING (
  (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  OR (agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = call_logs.company_id))
  OR (EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.id = call_logs.thread_id
      AND t.company_id = call_logs.company_id
      AND (
        t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = call_logs.company_id)
        OR (t.channel_number IS NOT NULL AND t.channel_number IN (
          SELECT wc.phone_number FROM public.whatsapp_channels wc
          JOIN public.team_members tm ON tm.id = wc.team_member_id
          WHERE tm.user_id = auth.uid() AND wc.company_id = call_logs.company_id AND tm.company_id = call_logs.company_id
        ))
      )
  ))
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin))
  OR (agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = call_logs.company_id))
  OR (EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.id = call_logs.thread_id
      AND t.company_id = call_logs.company_id
      AND t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = call_logs.company_id)
  ))
);