-- Opt-out fields on existing customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS whatsapp_opted_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out_date timestamptz;

-- Templates
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'marketing',
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_templates_category_check CHECK (category IN ('marketing','transactional','utility'))
);

-- Campaigns
CREATE TABLE public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  template_id uuid REFERENCES public.whatsapp_templates(id),
  instance_name text,
  total_contacts integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_campaigns_status_check CHECK (status IN ('draft','scheduled','in_progress','completed','paused','failed'))
);

-- Per-recipient logs
CREATE TABLE public.whatsapp_campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  rendered_message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  external_id text,
  company_id uuid REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_campaign_logs_status_check CHECK (status IN ('pending','sent','delivered','read','failed','opted_out'))
);

CREATE INDEX idx_wa_campaign_logs_campaign ON public.whatsapp_campaign_logs(campaign_id, status);
CREATE INDEX idx_wa_campaign_logs_external ON public.whatsapp_campaign_logs(external_id);
CREATE INDEX idx_wa_campaigns_status ON public.whatsapp_campaigns(status);

-- Company defaults
CREATE TRIGGER whatsapp_templates_set_company BEFORE INSERT ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id();
CREATE TRIGGER whatsapp_campaigns_set_company BEFORE INSERT ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id();
CREATE TRIGGER whatsapp_campaign_logs_set_company BEFORE INSERT ON public.whatsapp_campaign_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaigns TO authenticated;
GRANT ALL ON public.whatsapp_campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_campaign_logs TO authenticated;
GRANT ALL ON public.whatsapp_campaign_logs TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaign_logs ENABLE ROW LEVEL SECURITY;

-- Only privileged staff (admin / store_manager) inside the same tenant, or the Super Admin.
CREATE POLICY "Tenant staff manage whatsapp templates" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
      OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
    )
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
      OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
    )
  );

CREATE POLICY "Tenant staff manage whatsapp campaigns" ON public.whatsapp_campaigns
  FOR ALL TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
      OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
    )
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
      OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
    )
  );

CREATE POLICY "Tenant staff manage whatsapp campaign logs" ON public.whatsapp_campaign_logs
  FOR ALL TO authenticated
  USING (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
      OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
    )
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
      OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
    )
  );