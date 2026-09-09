-- Team invitations
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role_title text NOT NULL DEFAULT 'Support Agent',
  personal_message text,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'Invited',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email_masked text,
  opened_at timestamptz,
  accepted_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_company_idx ON public.invitations(company_id);
CREATE UNIQUE INDEX invitations_open_email_idx
  ON public.invitations(company_id, lower(email))
  WHERE status IN ('Invited','Opened');

GRANT SELECT ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own company invitations"
ON public.invitations FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
);

-- Referral codes (one per user)
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own referral code"
ON public.referral_codes FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- Referral tracking
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  referrer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referrer_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  invitee_email text,
  invited_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Opened',
  reward_status text NOT NULL DEFAULT 'None',
  reward_type text,
  reward_value numeric,
  reward_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referrals_referrer_idx ON public.referrals(referrer_user_id);
CREATE INDEX referrals_code_idx ON public.referrals(code);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own referrals"
ON public.referrals FOR SELECT TO authenticated
USING (referrer_user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- Platform-owner controlled referral program configuration (single row)
CREATE TABLE public.referral_program_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  reward_type text NOT NULL DEFAULT 'subscription_extension',
  reward_value numeric NOT NULL DEFAULT 0,
  qualification text NOT NULL DEFAULT 'company_activated',
  requires_approval boolean NOT NULL DEFAULT true,
  terms text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.referral_program_settings (id) VALUES (true);
GRANT SELECT ON public.referral_program_settings TO authenticated;
GRANT ALL ON public.referral_program_settings TO service_role;
ALTER TABLE public.referral_program_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in reads program settings"
ON public.referral_program_settings FOR SELECT TO authenticated
USING (true);