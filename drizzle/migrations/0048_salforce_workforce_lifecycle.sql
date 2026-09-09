-- Salforce AI: workforce lifecycle (recruitment -> exit) + System-as-Boss control layer

CREATE TABLE public.job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  territory text,
  headcount integer NOT NULL DEFAULT 1,
  description text,
  status text NOT NULL DEFAULT 'Open',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_openings_status_chk CHECK (status IN ('Open','On Hold','Closed')),
  CONSTRAINT job_openings_headcount_chk CHECK (headcount > 0)
);

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  opening_id uuid REFERENCES public.job_openings(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  city text,
  experience_years numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'Direct',
  stage text NOT NULL DEFAULT 'Applied',
  screening_score numeric,
  interview_score numeric,
  test_score numeric,
  decision_notes text,
  approved_by uuid,
  approved_at timestamptz,
  hired_team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_applications_stage_chk CHECK (stage IN
    ('Applied','Screening','Interview','Test','Selected','Approved','Onboarding','Hired','Rejected'))
);

CREATE TABLE public.employee_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  employee_code text,
  designation text,
  territory text,
  manager_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  joining_date date,
  base_salary numeric NOT NULL DEFAULT 0,
  employment_status text NOT NULL DEFAULT 'Probation',
  confirmation_date date,
  exit_type text,
  exit_date date,
  exit_reason text,
  clearance_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_records_status_chk CHECK (employment_status IN
    ('Probation','Confirmed','On Notice','Suspended','Resigned','Terminated')),
  CONSTRAINT employee_records_exit_chk CHECK (exit_type IS NULL OR exit_type IN ('Resignation','Termination','Contract End'))
);

CREATE TABLE public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  reference text,
  amount numeric,
  issued_on date,
  expires_on date,
  status text NOT NULL DEFAULT 'Pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_documents_status_chk CHECK (status IN ('Pending','Received','Verified','Returned','Expired')),
  CONSTRAINT employee_documents_type_chk CHECK (doc_type IN
    ('CNIC','Education','Experience Letter','Employment Agreement','Security Cheque','Guarantee','Bank Details','Other'))
);

CREATE TABLE public.territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  territory_id uuid REFERENCES public.territories(id) ON DELETE SET NULL,
  visit_frequency_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, team_member_id)
);

CREATE TABLE public.journey_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  territory_id uuid REFERENCES public.territories(id) ON DELETE SET NULL,
  planned_visits integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Planned',
  approved_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journey_plans_status_chk CHECK (status IN ('Planned','Approved','In Progress','Completed','Missed')),
  UNIQUE (team_member_id, plan_date)
);

CREATE TABLE public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.journey_plans(id) ON DELETE SET NULL,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  outcome text NOT NULL DEFAULT 'Pending',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visits_outcome_chk CHECK (outcome IN ('Pending','Order','No Order','Not Available','Follow Up'))
);

CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Present',
  check_in_at timestamptz,
  check_out_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_status_chk CHECK (status IN ('Present','Late','Half Day','Leave','Absent','Holiday')),
  UNIQUE (team_member_id, work_date)
);

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  amount_due numeric NOT NULL DEFAULT 0,
  amount_collected numeric NOT NULL DEFAULT 0,
  due_date date,
  collected_on date,
  status text NOT NULL DEFAULT 'Outstanding',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collections_status_chk CHECK (status IN ('Outstanding','Partial','Cleared','Overdue','Written Off')),
  CONSTRAINT collections_amount_chk CHECK (amount_due >= 0 AND amount_collected >= 0)
);

CREATE TABLE public.competitor_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  competitor_name text NOT NULL,
  product_name text,
  our_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  competitor_price numeric,
  our_price numeric,
  activity text,
  captured_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.incentive_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_achievement_percent numeric NOT NULL DEFAULT 100,
  commission_percent numeric NOT NULL DEFAULT 0,
  flat_bonus numeric NOT NULL DEFAULT 0,
  requires_collection_percent numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.incentive_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES public.incentive_rules(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  achievement_percent numeric NOT NULL DEFAULT 0,
  collection_percent numeric NOT NULL DEFAULT 0,
  sales_amount numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Calculated',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incentive_payouts_status_chk CHECK (status IN ('Calculated','Approved','Paid','Rejected'))
);

CREATE TABLE public.performance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  reason text NOT NULL,
  corrective_action text,
  deadline date,
  status text NOT NULL DEFAULT 'Open',
  issued_by uuid,
  acknowledged_at timestamptz,
  closed_at timestamptz,
  auto_generated boolean NOT NULL DEFAULT false,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_actions_type_chk CHECK (action_type IN
    ('Reminder','Warning','Final Warning','PIP','Suspension','Termination Recommendation','Appreciation','Promotion','Reward')),
  CONSTRAINT performance_actions_status_chk CHECK (status IN ('Open','Acknowledged','In Progress','Closed','Escalated','Cancelled')),
  CONSTRAINT performance_actions_level_chk CHECK (level BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX performance_actions_source_uk
  ON public.performance_actions (company_id, team_member_id, source_key)
  WHERE source_key IS NOT NULL;

CREATE TABLE public.trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  training_id uuid REFERENCES public.trainings(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  due_date date,
  status text NOT NULL DEFAULT 'Assigned',
  score numeric,
  completed_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_assignments_status_chk CHECK (status IN ('Assigned','In Progress','Completed','Failed','Overdue'))
);

CREATE TABLE public.hr_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  letter_type text NOT NULL,
  reference_no text,
  subject text,
  body text NOT NULL,
  issued_on date NOT NULL DEFAULT CURRENT_DATE,
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_letters_type_chk CHECK (letter_type IN
    ('Offer Letter','Appointment Letter','Confirmation Letter','Warning Letter','Appreciation Letter',
     'Promotion Letter','Experience Certificate','Training Certificate','Relieving Letter','Proforma Invoice'))
);

CREATE TABLE public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  detail text,
  source_key text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'Open',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_alerts_severity_chk CHECK (severity IN ('info','warning','critical')),
  CONSTRAINT system_alerts_status_chk CHECK (status IN ('Open','Acknowledged','Resolved','Dismissed'))
);

CREATE UNIQUE INDEX system_alerts_source_uk ON public.system_alerts (company_id, source_key);

CREATE TABLE public.workforce_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid,
  entity text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Standard tenant plumbing for every new table -------------------------------
DO $$
DECLARE t text;
  tables text[] := ARRAY[
    'job_openings','job_applications','employee_records','employee_documents','territories',
    'customer_allocations','journey_plans','visits','attendance_records','collections',
    'competitor_intel','incentive_rules','incentive_payouts','performance_actions','trainings',
    'training_assignments','hr_letters','system_alerts','workforce_audit_logs'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY "Company members read %1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Company members write %1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Company members update %1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
      WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "Company admins delete %1$s" ON public.%1$I FOR DELETE TO authenticated
      USING (
        company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
        AND (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
             OR EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.is_super_admin))
      )
    $f$, t);
    EXECUTE format('CREATE TRIGGER %1$I BEFORE INSERT ON public.%2$I FOR EACH ROW EXECUTE FUNCTION public.set_crm_company_id()',
      t || '_set_company', t);
    EXECUTE format('CREATE TRIGGER %1$I BEFORE INSERT OR UPDATE ON public.%2$I FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_active()',
      t || '_subscription_guard', t);
  END LOOP;
END $$;

CREATE INDEX visits_member_date_idx ON public.visits (company_id, team_member_id, visit_date);
CREATE INDEX attendance_member_date_idx ON public.attendance_records (company_id, team_member_id, work_date);
CREATE INDEX collections_status_idx ON public.collections (company_id, status, due_date);
CREATE INDEX alerts_open_idx ON public.system_alerts (company_id, status, severity);
CREATE INDEX performance_actions_member_idx ON public.performance_actions (company_id, team_member_id, status);