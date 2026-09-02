-- Team members (sales reps / agents)
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  role_title text NOT NULL DEFAULT 'Sales Representative',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage team members" ON public.team_members FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- Communication threads (one per conversation across channels)
CREATE TABLE public.communication_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type text NOT NULL DEFAULT 'whatsapp',
  contact_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  contact_name text,
  contact_handle text,
  subject text,
  assigned_to uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Open',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_count integer NOT NULL DEFAULT 0,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_threads_channel_chk CHECK (channel_type IN ('whatsapp','email','call','webchat')),
  CONSTRAINT communication_threads_status_chk CHECK (status IN ('Open','In Progress','Resolved'))
);
CREATE INDEX communication_threads_channel_idx ON public.communication_threads (channel_type, last_message_at DESC);
CREATE INDEX communication_threads_assigned_idx ON public.communication_threads (assigned_to);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_threads TO authenticated;
GRANT ALL ON public.communication_threads TO service_role;
ALTER TABLE public.communication_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage threads" ON public.communication_threads FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- Messages inside a thread
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.communication_threads(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'customer',
  sender_name text,
  content text NOT NULL DEFAULT '',
  subject text,
  delivery_status text NOT NULL DEFAULT 'sent',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_sender_chk CHECK (sender_type IN ('customer','agent','system'))
);
CREATE INDEX messages_thread_idx ON public.messages (thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage messages" ON public.messages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- Call logs
CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.communication_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  caller_name text,
  caller_number text,
  call_type text NOT NULL DEFAULT 'Incoming',
  duration_seconds integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Completed',
  notes text,
  recording_url text,
  transcript text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_logs_type_chk CHECK (call_type IN ('Incoming','Outgoing','Missed'))
);
CREATE INDEX call_logs_created_idx ON public.call_logs (created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage call logs" ON public.call_logs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- Keep thread activity fresh
CREATE OR REPLACE FUNCTION public.touch_thread_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.communication_threads
  SET last_message_at = NEW.created_at,
      unread_count = CASE WHEN NEW.sender_type = 'customer' THEN unread_count + 1 ELSE 0 END
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_thread_on_message() FROM anon, authenticated, public;
CREATE TRIGGER messages_touch_thread AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_thread_on_message();

-- Demo data so the inbox is populated on first load
INSERT INTO public.team_members (id, full_name, email, phone, role_title) VALUES
  ('11111111-1111-4111-8111-000000000001','Ayesha Khan','ayesha@meemza.com','+92 300 1112233','Senior Sales Rep'),
  ('11111111-1111-4111-8111-000000000002','Bilal Ahmed','bilal@meemza.com','+92 301 4455667','Sales Representative'),
  ('11111111-1111-4111-8111-000000000003','Hina Raza','hina@meemza.com','+92 302 7788990','Support Agent'),
  ('11111111-1111-4111-8111-000000000004','Usman Tariq','usman@meemza.com','+92 321 9900112','Key Accounts Manager');

INSERT INTO public.communication_threads (id, channel_type, contact_name, contact_handle, subject, assigned_to, status, last_message_at, unread_count) VALUES
  ('22222222-2222-4222-8222-000000000001','whatsapp','Rashid Textiles','+92 300 5551234','Bulk caustic soda pricing','11111111-1111-4111-8111-000000000001','Open', now() - interval '12 minutes', 2),
  ('22222222-2222-4222-8222-000000000002','whatsapp','Sana Industries','+92 333 8887766','Delivery ETA for order 1042','11111111-1111-4111-8111-000000000002','In Progress', now() - interval '3 hours', 0),
  ('22222222-2222-4222-8222-000000000003','email','Zeeshan Pharma','procurement@zeeshanpharma.pk','Quotation request – Isopropyl Alcohol 200L','11111111-1111-4111-8111-000000000004','Open', now() - interval '1 hour', 1),
  ('22222222-2222-4222-8222-000000000004','email','Karachi Dyes Ltd','accounts@karachidyes.com','Invoice discrepancy INV-2291','11111111-1111-4111-8111-000000000003','Resolved', now() - interval '2 days', 0),
  ('22222222-2222-4222-8222-000000000005','call','Faisal Chemicals','+92 345 1230099','Follow-up call – sample dispatch','11111111-1111-4111-8111-000000000001','In Progress', now() - interval '5 hours', 0),
  ('22222222-2222-4222-8222-000000000006','call','Unknown caller','+92 311 4567890','Missed call','11111111-1111-4111-8111-000000000002','Open', now() - interval '30 minutes', 1),
  ('22222222-2222-4222-8222-000000000007','webchat','Website visitor','visitor-8842','Website chat – returns policy','11111111-1111-4111-8111-000000000003','Resolved', now() - interval '6 hours', 0);

INSERT INTO public.messages (thread_id, sender_type, sender_name, content, subject, delivery_status, created_at) VALUES
  ('22222222-2222-4222-8222-000000000001','customer','Rashid Textiles','Assalam o alaikum, need pricing for 5 tons caustic soda flakes.', NULL,'delivered', now() - interval '40 minutes'),
  ('22222222-2222-4222-8222-000000000001','agent','Ayesha Khan','Walaikum assalam! Rs 142/kg for 5 tons, delivered Karachi. Shall I send a formal quote?', NULL,'read', now() - interval '32 minutes'),
  ('22222222-2222-4222-8222-000000000001','customer','Rashid Textiles','Please send the quote and also share payment terms.', NULL,'delivered', now() - interval '12 minutes'),
  ('22222222-2222-4222-8222-000000000002','customer','Sana Industries','Any update on order 1042?', NULL,'delivered', now() - interval '5 hours'),
  ('22222222-2222-4222-8222-000000000002','agent','Bilal Ahmed','Dispatched today via TCS, tracking will be shared within the hour.', NULL,'read', now() - interval '3 hours'),
  ('22222222-2222-4222-8222-000000000003','customer','Zeeshan Pharma','Kindly quote 200L IPA 99.9% with MSDS and lead time.','Quotation request – Isopropyl Alcohol 200L','delivered', now() - interval '1 hour'),
  ('22222222-2222-4222-8222-000000000004','customer','Karachi Dyes Ltd','Invoice INV-2291 shows 3 drums, we received 2.','Invoice discrepancy INV-2291','delivered', now() - interval '3 days'),
  ('22222222-2222-4222-8222-000000000004','agent','Hina Raza','Apologies — credit note issued and third drum ships tomorrow.','RE: Invoice discrepancy INV-2291','read', now() - interval '2 days'),
  ('22222222-2222-4222-8222-000000000005','system','System','Outbound call completed – 4m 12s', NULL,'sent', now() - interval '5 hours'),
  ('22222222-2222-4222-8222-000000000006','system','System','Missed inbound call', NULL,'sent', now() - interval '30 minutes'),
  ('22222222-2222-4222-8222-000000000007','customer','Website visitor','Can I return an opened solvent drum?', NULL,'delivered', now() - interval '7 hours'),
  ('22222222-2222-4222-8222-000000000007','agent','Hina Raza','Unopened only within 7 days, unless the goods are damaged or incorrect.', NULL,'read', now() - interval '6 hours');

INSERT INTO public.call_logs (thread_id, agent_id, caller_name, caller_number, call_type, duration_seconds, status, notes, recording_url, transcript, created_at) VALUES
  ('22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-000000000001','Faisal Chemicals','+92 345 1230099','Outgoing',252,'Completed','Agreed to send 1L samples of IPA and acetone. Follow up Friday.', NULL,'Agent: Calling regarding your sample request... Customer: Yes please send both samples.', now() - interval '5 hours'),
  ('22222222-2222-4222-8222-000000000006','11111111-1111-4111-8111-000000000002','Unknown caller','+92 311 4567890','Missed',0,'Missed','No voicemail left. Call back required.', NULL, NULL, now() - interval '30 minutes'),
  (NULL,'11111111-1111-4111-8111-000000000004','Zeeshan Pharma','+92 21 34567890','Incoming',488,'Completed','Discussed IPA pricing, quotation to be emailed.', NULL,'Customer: We need 200 litres monthly... Agent: I will email the quote today.', now() - interval '1 day');