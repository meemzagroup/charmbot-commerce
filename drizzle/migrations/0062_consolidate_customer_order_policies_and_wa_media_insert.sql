-- 1) Consolidate overlapping customers/orders policies into one clear set per command.

DROP POLICY IF EXISTS "Company admins manage customers" ON public.customers;
DROP POLICY IF EXISTS "Owner scoped customers read" ON public.customers;
DROP POLICY IF EXISTS "Owner scoped customers insert" ON public.customers;
DROP POLICY IF EXISTS "Owner scoped customers update" ON public.customers;
DROP POLICY IF EXISTS "Owner scoped customers delete" ON public.customers;
DROP POLICY IF EXISTS "Write scope customers insert" ON public.customers;
DROP POLICY IF EXISTS "Write scope customers update" ON public.customers;
DROP POLICY IF EXISTS "Write scope customers delete" ON public.customers;

-- Single restrictive tenant boundary (unchanged semantics), recreated for clarity.
DROP POLICY IF EXISTS "Tenant scope customers" ON public.customers;
CREATE POLICY "Tenant scope customers"
  ON public.customers AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Customers read access"
  ON public.customers FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
    )
    OR EXISTS (
      SELECT 1 FROM public.communication_threads t
      WHERE t.contact_id = customers.id
        AND t.company_id = customers.company_id
        AND (
          t.assigned_to IN (
            SELECT tm.id FROM public.team_members tm
            WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
          )
          OR (t.channel_number IS NOT NULL AND t.channel_number IN (
            SELECT wc.phone_number FROM public.whatsapp_channels wc
            JOIN public.team_members tm ON tm.id = wc.team_member_id
            WHERE tm.user_id = auth.uid()
              AND wc.company_id = customers.company_id
              AND tm.company_id = customers.company_id
          ))
        )
    )
  );

CREATE POLICY "Customers insert access"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
    )
  );

CREATE POLICY "Customers update access"
  ON public.customers FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
    )
  );

CREATE POLICY "Customers delete access"
  ON public.customers FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
    )
  );

-- Orders
DROP POLICY IF EXISTS "Company admins manage orders" ON public.orders;
DROP POLICY IF EXISTS "Owner scoped orders read" ON public.orders;
DROP POLICY IF EXISTS "Owner scoped orders insert" ON public.orders;
DROP POLICY IF EXISTS "Owner scoped orders update" ON public.orders;
DROP POLICY IF EXISTS "Owner scoped orders delete" ON public.orders;
DROP POLICY IF EXISTS "Write scope orders" ON public.orders;

DROP POLICY IF EXISTS "Tenant scope orders" ON public.orders;
CREATE POLICY "Tenant scope orders"
  ON public.orders AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Orders read access"
  ON public.orders FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id
    )
  );

CREATE POLICY "Orders insert access"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id
    )
  );

CREATE POLICY "Orders update access"
  ON public.orders FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id
    )
  );

CREATE POLICY "Orders delete access"
  ON public.orders FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to IN (
      SELECT tm.id FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id
    )
  );

-- 2) Controlled upload path for whatsapp-media: company-scoped folder, admins only.
DROP POLICY IF EXISTS "Company admins upload whatsapp media" ON storage.objects;
CREATE POLICY "Company admins upload whatsapp media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND public.current_company_id() IS NOT NULL
    AND (storage.foldername(name))[1] = (public.current_company_id())::text
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  );

DROP POLICY IF EXISTS "Company admins update whatsapp media" ON storage.objects;
CREATE POLICY "Company admins update whatsapp media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = (public.current_company_id())::text
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = (public.current_company_id())::text
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
  );