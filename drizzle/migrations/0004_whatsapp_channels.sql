CREATE TABLE public.whatsapp_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  phone_number text NOT NULL,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX whatsapp_channels_phone_number_key ON public.whatsapp_channels (phone_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_channels TO authenticated;
GRANT ALL ON public.whatsapp_channels TO service_role;

ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read whatsapp channels" ON public.whatsapp_channels
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin'::app_role,'store_manager'::app_role,'support_agent'::app_role])));

CREATE POLICY "Managers insert whatsapp channels" ON public.whatsapp_channels
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin'::app_role,'store_manager'::app_role])));

CREATE POLICY "Managers update whatsapp channels" ON public.whatsapp_channels
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin'::app_role,'store_manager'::app_role])))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin'::app_role,'store_manager'::app_role])));

CREATE POLICY "Managers delete whatsapp channels" ON public.whatsapp_channels
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['admin'::app_role,'store_manager'::app_role])));

ALTER TABLE public.communication_threads ADD COLUMN channel_number text;