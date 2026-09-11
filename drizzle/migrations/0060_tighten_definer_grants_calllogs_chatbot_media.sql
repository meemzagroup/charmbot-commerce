-- 1. SECURITY DEFINER functions: remove PUBLIC/anon execute across public schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- Re-grant only the helpers that signed-in users must call for RLS evaluation.
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

-- Atomic RPCs used by the app from the client stay callable by signed-in users.
GRANT EXECUTE ON FUNCTION public.delete_customer_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_return(uuid) TO authenticated;

-- 2. call_logs: align WITH CHECK with USING (add the whatsapp channel-number path)
DROP POLICY IF EXISTS "Owner scoped call logs" ON public.call_logs;
CREATE POLICY "Owner scoped call logs" ON public.call_logs
AS PERMISSIVE FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = call_logs.company_id)
  OR EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.id = call_logs.thread_id AND t.company_id = call_logs.company_id
      AND (
        t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = call_logs.company_id)
        OR (t.channel_number IS NOT NULL AND t.channel_number IN (
          SELECT wc.phone_number FROM public.whatsapp_channels wc
          JOIN public.team_members tm ON tm.id = wc.team_member_id
          WHERE tm.user_id = auth.uid() AND wc.company_id = call_logs.company_id AND tm.company_id = call_logs.company_id))
      )
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR agent_id IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = call_logs.company_id)
  OR EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.id = call_logs.thread_id AND t.company_id = call_logs.company_id
      AND (
        t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.company_id = call_logs.company_id)
        OR (t.channel_number IS NOT NULL AND t.channel_number IN (
          SELECT wc.phone_number FROM public.whatsapp_channels wc
          JOIN public.team_members tm ON tm.id = wc.team_member_id
          WHERE tm.user_id = auth.uid() AND wc.company_id = call_logs.company_id AND tm.company_id = call_logs.company_id))
      )
  )
);

-- 3. chatbot_conversations: no anon role in policies + explicit anon deny
DROP POLICY IF EXISTS "Chatbot conversations tenant guard" ON public.chatbot_conversations;
CREATE POLICY "Chatbot conversations tenant guard" ON public.chatbot_conversations
AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id IS NOT NULL AND company_id = public.current_company_id())
WITH CHECK (company_id IS NOT NULL AND company_id = public.current_company_id());

CREATE POLICY "Deny anonymous chatbot conversations" ON public.chatbot_conversations
AS RESTRICTIVE FOR ALL TO anon
USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.chatbot_conversations FROM anon;

-- 4. whatsapp-media storage: require ownership join back to messages
DROP POLICY IF EXISTS "Company members read whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Company members write whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Company members update whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Company admins delete whatsapp media" ON storage.objects;

CREATE POLICY "Company members read whatsapp media" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.company_id = public.current_company_id()
      AND m.metadata ->> 'media_path' = storage.objects.name
  )
);

CREATE POLICY "Company admins delete whatsapp media" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = public.current_company_id()::text
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.company_id = public.current_company_id()
      AND m.metadata ->> 'media_path' = storage.objects.name
  )
  AND (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);
