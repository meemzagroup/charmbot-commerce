-- 1. Subscription packages -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  monthly_price numeric NOT NULL DEFAULT 0,
  annual_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PKR',
  trial_days integer NOT NULL DEFAULT 0,
  max_users integer,
  max_whatsapp_channels integer,
  max_branches integer,
  max_customers integer,
  max_orders integer,
  max_campaigns_per_month integer,
  storage_mb integer,
  ai_message_limit integer,
  api_access boolean NOT NULL DEFAULT false,
  support_level text NOT NULL DEFAULT 'Standard',
  modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_packages TO authenticated;
GRANT ALL ON public.subscription_packages TO service_role;
ALTER TABLE public.subscription_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "packages readable by authenticated" ON public.subscription_packages;
CREATE POLICY "packages readable by authenticated"
  ON public.subscription_packages FOR SELECT TO authenticated USING (true);

-- 2. Company profile / subscription fields ----------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Karachi',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'PKR',
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.subscription_packages(id),
  ADD COLUMN IF NOT EXISTS subscription_start timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS limit_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- 3. Currencies -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.currencies (
  code text PRIMARY KEY,
  name text NOT NULL,
  symbol text NOT NULL,
  decimals integer NOT NULL DEFAULT 2,
  exchange_rate numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "currencies readable" ON public.currencies;
CREATE POLICY "currencies readable" ON public.currencies FOR SELECT TO authenticated USING (true);

INSERT INTO public.currencies (code, name, symbol, decimals) VALUES
  ('PKR','Pakistani Rupee','Rs',2),
  ('USD','US Dollar','$',2),
  ('EUR','Euro','EUR',2),
  ('GBP','British Pound','GBP',2),
  ('AED','UAE Dirham','AED',2),
  ('SAR','Saudi Riyal','SAR',2),
  ('INR','Indian Rupee','INR',2)
ON CONFLICT (code) DO NOTHING;

-- 4. Platform audit log ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  company_id uuid REFERENCES public.companies(id),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_audit_logs TO authenticated;
GRANT ALL ON public.platform_audit_logs TO service_role;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform audit readable by super admin" ON public.platform_audit_logs;
CREATE POLICY "platform audit readable by super admin"
  ON public.platform_audit_logs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 5. Granular permissions ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  module text NOT NULL,
  action text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module, action)
);
GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own permissions" ON public.user_permissions;
CREATE POLICY "users read own permissions"
  ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- 6. Plan helper functions ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_plan(_company_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'company_id', c.id,
    'status', c.status,
    'expiry', c.subscription_expiry,
    'trial_ends_at', c.trial_ends_at,
    'modules', COALESCE(p.modules, '{}'::jsonb),
    'overrides', c.limit_overrides,
    'package', to_jsonb(p.*)
  )
  FROM public.companies c
  LEFT JOIN public.subscription_packages p ON p.id = c.package_id
  WHERE c.id = _company_id;
$$;

CREATE OR REPLACE FUNCTION public.company_subscription_active(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT c.status = 'Active'
       AND c.is_archived = false
       AND (c.subscription_expiry IS NULL OR c.subscription_expiry > now())
    FROM public.companies c WHERE c.id = _company_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.company_limit(_company_id uuid, _key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF(c.limit_overrides ->> _key, '')::integer,
    CASE _key
      WHEN 'max_users' THEN p.max_users
      WHEN 'max_whatsapp_channels' THEN p.max_whatsapp_channels
      WHEN 'max_customers' THEN p.max_customers
      WHEN 'max_orders' THEN p.max_orders
      WHEN 'max_campaigns_per_month' THEN p.max_campaigns_per_month
      ELSE NULL
    END)
  FROM public.companies c
  LEFT JOIN public.subscription_packages p ON p.id = c.package_id
  WHERE c.id = _company_id;
$$;

CREATE OR REPLACE FUNCTION public.company_module_enabled(_company_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN p.id IS NULL THEN true              -- no package assigned: nothing restricted
      WHEN p.modules ? _module THEN (p.modules ->> _module)::boolean
      ELSE true
    END
    FROM public.companies c
    LEFT JOIN public.subscription_packages p ON p.id = c.package_id
    WHERE c.id = _company_id
  ), true);
$$;

REVOKE EXECUTE ON FUNCTION public.company_plan(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.company_limit(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.company_module_enabled(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.company_subscription_active(uuid) FROM anon;

-- 7. Subscription write-lock + channel limit enforcement (DB level) ----------
CREATE OR REPLACE FUNCTION public.enforce_subscription_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  cid := COALESCE(NEW.company_id, (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
  IF cid IS NOT NULL AND NOT public.company_subscription_active(cid) THEN
    RAISE EXCEPTION 'Subscription expired or suspended - contact administrator to renew subscription';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_channel_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid; lim integer; used integer;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  cid := COALESCE(NEW.company_id, (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));
  lim := public.company_limit(cid, 'max_whatsapp_channels');
  IF lim IS NOT NULL THEN
    SELECT count(*) INTO used FROM public.whatsapp_channels WHERE company_id = cid;
    IF used >= lim THEN
      RAISE EXCEPTION 'WhatsApp channel limit reached for your subscription package (%). Upgrade required.', lim;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_subscription_guard ON public.orders;
CREATE TRIGGER orders_subscription_guard BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_active();
DROP TRIGGER IF EXISTS customers_subscription_guard ON public.customers;
CREATE TRIGGER customers_subscription_guard BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_active();
DROP TRIGGER IF EXISTS products_subscription_guard ON public.products;
CREATE TRIGGER products_subscription_guard BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_active();
DROP TRIGGER IF EXISTS campaigns_subscription_guard ON public.whatsapp_campaigns;
CREATE TRIGGER campaigns_subscription_guard BEFORE INSERT OR UPDATE ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_active();
DROP TRIGGER IF EXISTS channels_subscription_guard ON public.whatsapp_channels;
CREATE TRIGGER channels_subscription_guard BEFORE INSERT OR UPDATE ON public.whatsapp_channels
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_active();
DROP TRIGGER IF EXISTS channels_limit_guard ON public.whatsapp_channels;
CREATE TRIGGER channels_limit_guard BEFORE INSERT ON public.whatsapp_channels
  FOR EACH ROW EXECUTE FUNCTION public.enforce_channel_limit();

-- 8. Seed default packages and backfill the existing tenant -------------------
INSERT INTO public.subscription_packages (name, description, monthly_price, annual_price, currency, trial_days, max_users, max_whatsapp_channels, max_customers, max_orders, max_campaigns_per_month, storage_mb, ai_message_limit, api_access, support_level, modules)
SELECT * FROM (VALUES
  ('Trial','14-day evaluation plan',0,0,'PKR',14,2,1,200,200,2,500,200,false,'Community',
    '{"dashboard":true,"orders":true,"inbox":true,"whatsapp":true,"campaigns":false,"email":false,"webchat":true,"calls":false,"customers":true,"inventory":true,"inquiries":true,"reports":false,"ai":true,"integrations":false,"api":false,"user_management":true,"account_recovery":true,"settings":true}'::jsonb),
  ('Starter','Small teams getting started',5000,50000,'PKR',0,5,2,2000,2000,10,2000,1000,false,'Standard',
    '{"dashboard":true,"orders":true,"inbox":true,"whatsapp":true,"campaigns":true,"email":false,"webchat":true,"calls":true,"customers":true,"inventory":true,"inquiries":true,"reports":true,"ai":true,"integrations":false,"api":false,"user_management":true,"account_recovery":true,"settings":true}'::jsonb),
  ('Professional','Growing sales and support teams',15000,150000,'PKR',0,20,6,25000,25000,50,10000,10000,true,'Priority',
    '{"dashboard":true,"orders":true,"inbox":true,"whatsapp":true,"campaigns":true,"email":true,"webchat":true,"calls":true,"customers":true,"inventory":true,"inquiries":true,"reports":true,"ai":true,"integrations":true,"api":true,"user_management":true,"account_recovery":true,"settings":true}'::jsonb),
  ('Enterprise','Unlimited scale with dedicated support',40000,400000,'PKR',0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,true,'Dedicated',
    '{"dashboard":true,"orders":true,"inbox":true,"whatsapp":true,"campaigns":true,"email":true,"webchat":true,"calls":true,"customers":true,"inventory":true,"inquiries":true,"reports":true,"ai":true,"integrations":true,"api":true,"user_management":true,"account_recovery":true,"settings":true}'::jsonb)
) AS v(name, description, monthly_price, annual_price, currency, trial_days, max_users, max_whatsapp_channels, max_customers, max_orders, max_campaigns_per_month, storage_mb, ai_message_limit, api_access, support_level, modules)
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_packages);

UPDATE public.companies c
SET package_id = (SELECT id FROM public.subscription_packages WHERE name = 'Enterprise' LIMIT 1),
    subscription_start = COALESCE(c.subscription_start, c.created_at),
    status = COALESCE(NULLIF(c.status, ''), 'Active')
WHERE c.package_id IS NULL;
