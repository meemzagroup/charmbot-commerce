ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_channels ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.communication_threads ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.chatbot_conversations ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.team_members SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1) WHERE company_id IS NULL;
UPDATE public.whatsapp_channels SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1) WHERE company_id IS NULL;
UPDATE public.communication_threads SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1) WHERE company_id IS NULL;
UPDATE public.call_logs SET company_id = (SELECT t.company_id FROM public.communication_threads t WHERE t.id = call_logs.thread_id) WHERE company_id IS NULL;
UPDATE public.messages SET company_id = (SELECT t.company_id FROM public.communication_threads t WHERE t.id = messages.thread_id) WHERE company_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_crm_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    IF TG_TABLE_NAME IN ('messages', 'call_logs') AND NEW.thread_id IS NOT NULL THEN
      NEW.company_id := (SELECT t.company_id FROM public.communication_threads t WHERE t.id = NEW.thread_id);
    ELSE
      NEW.company_id := (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_set_company ON public.team_members;
CREATE TRIGGER team_members_set_company BEFORE INSERT ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.set_crm_company_id();
DROP TRIGGER IF EXISTS channels_set_company ON public.whatsapp_channels;
CREATE TRIGGER channels_set_company BEFORE INSERT ON public.whatsapp_channels FOR EACH ROW EXECUTE FUNCTION public.set_crm_company_id();
DROP TRIGGER IF EXISTS threads_set_company ON public.communication_threads;
CREATE TRIGGER threads_set_company BEFORE INSERT ON public.communication_threads FOR EACH ROW EXECUTE FUNCTION public.set_crm_company_id();
DROP TRIGGER IF EXISTS calls_set_company ON public.call_logs;
CREATE TRIGGER calls_set_company BEFORE INSERT ON public.call_logs FOR EACH ROW EXECUTE FUNCTION public.set_crm_company_id();
DROP TRIGGER IF EXISTS messages_set_company ON public.messages;
CREATE TRIGGER messages_set_company BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_crm_company_id();
DROP TRIGGER IF EXISTS chatbot_set_company ON public.chatbot_conversations;
CREATE TRIGGER chatbot_set_company BEFORE INSERT ON public.chatbot_conversations FOR EACH ROW EXECUTE FUNCTION public.set_crm_company_id();

DROP POLICY IF EXISTS "Tenant scope team members" ON public.team_members;
CREATE POLICY "Tenant scope team members" ON public.team_members AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant scope WhatsApp channels" ON public.whatsapp_channels;
CREATE POLICY "Tenant scope WhatsApp channels" ON public.whatsapp_channels AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant scope communication threads" ON public.communication_threads;
CREATE POLICY "Tenant scope communication threads" ON public.communication_threads AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant scope call logs" ON public.call_logs;
CREATE POLICY "Tenant scope call logs" ON public.call_logs AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant scope messages" ON public.messages;
CREATE POLICY "Tenant scope messages" ON public.messages AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant scope chatbot conversations" ON public.chatbot_conversations;
CREATE POLICY "Tenant scope chatbot conversations" ON public.chatbot_conversations AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE INDEX IF NOT EXISTS team_members_company_id_idx ON public.team_members (company_id);
CREATE INDEX IF NOT EXISTS whatsapp_channels_company_id_idx ON public.whatsapp_channels (company_id);
CREATE INDEX IF NOT EXISTS communication_threads_company_id_idx ON public.communication_threads (company_id);
CREATE INDEX IF NOT EXISTS call_logs_company_id_idx ON public.call_logs (company_id);
CREATE INDEX IF NOT EXISTS messages_company_id_idx ON public.messages (company_id);
CREATE INDEX IF NOT EXISTS chatbot_conversations_company_id_idx ON public.chatbot_conversations (company_id);