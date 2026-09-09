DROP POLICY IF EXISTS "Company members read own company logo" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload company logo" ON storage.objects;
DROP POLICY IF EXISTS "Admins update company logo" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete company logo" ON storage.objects;

CREATE POLICY "Company members read own company logo"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'company-logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.is_super_admin OR p.company_id::text = (storage.foldername(name))[1])
  )
);

CREATE POLICY "Admins upload company logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_super_admin
        OR (
          p.company_id::text = (storage.foldername(name))[1]
          AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
        )
      )
  )
);

CREATE POLICY "Admins update company logo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_super_admin
        OR (
          p.company_id::text = (storage.foldername(name))[1]
          AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
        )
      )
  )
);

CREATE POLICY "Admins delete company logo"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_super_admin
        OR (
          p.company_id::text = (storage.foldername(name))[1]
          AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
        )
      )
  )
);
