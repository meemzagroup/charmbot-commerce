DROP POLICY IF EXISTS "Write scope customers" ON public.customers;
CREATE POLICY "Write scope customers"
ON public.customers
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (true)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role
  )
  OR assigned_to IN (
    SELECT tm.id FROM public.team_members tm
    WHERE tm.user_id = auth.uid() AND tm.company_id = customers.company_id
  )
);

DROP POLICY IF EXISTS "Write scope orders" ON public.orders;
CREATE POLICY "Write scope orders"
ON public.orders
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (true)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role
  )
  OR assigned_to IN (
    SELECT tm.id FROM public.team_members tm
    WHERE tm.user_id = auth.uid() AND tm.company_id = orders.company_id
  )
);

REVOKE ALL ON public.recovery_attempts FROM anon, authenticated;
GRANT ALL ON public.recovery_attempts TO service_role;
ALTER TABLE public.recovery_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No client access to recovery attempts" ON public.recovery_attempts;
CREATE POLICY "No client access to recovery attempts"
ON public.recovery_attempts
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Company members read whatsapp media" ON storage.objects;
CREATE POLICY "Company members read whatsapp media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company members write whatsapp media" ON storage.objects;
CREATE POLICY "Company members write whatsapp media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company members update whatsapp media" ON storage.objects;
CREATE POLICY "Company members update whatsapp media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company admins delete whatsapp media" ON storage.objects;
CREATE POLICY "Company admins delete whatsapp media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
  AND (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
    OR EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role
    )
  )
);