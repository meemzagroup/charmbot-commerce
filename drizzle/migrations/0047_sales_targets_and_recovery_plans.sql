CREATE TABLE public.sales_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  metric text NOT NULL DEFAULT 'sales_amount',
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_targets_metric_chk CHECK (metric IN ('sales_amount','orders','new_customers')),
  CONSTRAINT sales_targets_period_chk CHECK (period_end >= period_start),
  CONSTRAINT sales_targets_value_chk CHECK (target_value >= 0)
);

CREATE INDEX sales_targets_company_period_idx ON public.sales_targets (company_id, period_start, period_end);
CREATE INDEX sales_targets_member_idx ON public.sales_targets (team_member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_targets TO authenticated;
GRANT ALL ON public.sales_targets TO service_role;

ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read targets" ON public.sales_targets FOR SELECT TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Company admins manage targets" ON public.sales_targets FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

CREATE TRIGGER sales_targets_set_company BEFORE INSERT ON public.sales_targets
FOR EACH ROW EXECUTE FUNCTION public.set_crm_company_id();

CREATE TRIGGER sales_targets_subscription_guard BEFORE INSERT OR UPDATE ON public.sales_targets
FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_active();

CREATE TABLE public.target_recovery_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.sales_targets(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  risk_level text NOT NULL DEFAULT 'yellow',
  gap_percent numeric NOT NULL DEFAULT 0,
  action text NOT NULL,
  commitment text,
  deadline date,
  status text NOT NULL DEFAULT 'Open',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT target_recovery_status_chk CHECK (status IN ('Open','Achieved','Missed','Closed')),
  CONSTRAINT target_recovery_risk_chk CHECK (risk_level IN ('green','blue','yellow','orange','red'))
);

CREATE INDEX target_recovery_plans_company_idx ON public.target_recovery_plans (company_id, status);
CREATE INDEX target_recovery_plans_target_idx ON public.target_recovery_plans (target_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_recovery_plans TO authenticated;
GRANT ALL ON public.target_recovery_plans TO service_role;

ALTER TABLE public.target_recovery_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read recovery plans" ON public.target_recovery_plans FOR SELECT TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Members create own recovery plans" ON public.target_recovery_plans FOR INSERT TO authenticated
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND (
    team_member_id IN (SELECT t.id FROM public.team_members t WHERE t.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
  )
);

CREATE POLICY "Company admins manage recovery plans" ON public.target_recovery_plans FOR ALL TO authenticated
USING (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
)
WITH CHECK (
  company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
);

CREATE TRIGGER target_recovery_plans_set_company BEFORE INSERT ON public.target_recovery_plans
FOR EACH ROW EXECUTE FUNCTION public.set_crm_company_id();

CREATE TRIGGER target_recovery_plans_subscription_guard BEFORE INSERT OR UPDATE ON public.target_recovery_plans
FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_active();