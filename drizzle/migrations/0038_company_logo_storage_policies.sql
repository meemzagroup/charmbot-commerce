-- Company logos: objects are stored under "<company_id>/<file>"
CREATE POLICY "Company members read own company logo"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (
      SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
    )
  )
);

CREATE POLICY "Admins upload company logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin')
      AND (storage.foldername(name))[1] = (
        SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Admins update company logo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin')
      AND (storage.foldername(name))[1] = (
        SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Admins delete company logo"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin')
      AND (storage.foldername(name))[1] = (
        SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
  )
);
