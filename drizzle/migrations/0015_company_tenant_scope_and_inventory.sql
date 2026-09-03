-- 1. Company / tenant registry -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  api_key text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_api_key_key ON public.companies (api_key);

GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 2. Tenant columns -------------------------------------------------------------
ALTER TABLE public.profiles          ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.products          ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.customers         ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.orders            ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.leads_inquiries   ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.products          ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 10;

DROP POLICY IF EXISTS "Members read own company" ON public.companies;
CREATE POLICY "Members read own company" ON public.companies
FOR SELECT TO authenticated
USING (id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

-- 3. Backfill a default company for the existing workspace ----------------------
INSERT INTO public.companies (name)
SELECT 'Meemza Chemicals'
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

UPDATE public.profiles        SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1) WHERE company_id IS NULL;
UPDATE public.products        SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1) WHERE company_id IS NULL;
UPDATE public.customers       SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1) WHERE company_id IS NULL;
UPDATE public.orders          SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1) WHERE company_id IS NULL;
UPDATE public.leads_inquiries SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1) WHERE company_id IS NULL;

-- 4. Automatic tenant stamping ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := COALESCE(
      (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()),
      (SELECT c.id FROM public.companies c ORDER BY c.created_at LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_set_company ON public.products;
CREATE TRIGGER products_set_company BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

DROP TRIGGER IF EXISTS customers_set_company ON public.customers;
CREATE TRIGGER customers_set_company BEFORE INSERT ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

DROP TRIGGER IF EXISTS orders_set_company ON public.orders;
CREATE TRIGGER orders_set_company BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

DROP TRIGGER IF EXISTS leads_set_company ON public.leads_inquiries;
CREATE TRIGGER leads_set_company BEFORE INSERT ON public.leads_inquiries
FOR EACH ROW EXECUTE FUNCTION public.set_company_id();

CREATE OR REPLACE FUNCTION public.set_profile_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := (SELECT c.id FROM public.companies c ORDER BY c.created_at LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_company ON public.profiles;
CREATE TRIGGER profiles_set_company BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_profile_company();

-- 5. Restrictive tenant isolation -------------------------------------------------
DROP POLICY IF EXISTS "Tenant scope products" ON public.products;
CREATE POLICY "Tenant scope products" ON public.products AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant scope customers" ON public.customers;
CREATE POLICY "Tenant scope customers" ON public.customers AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant scope orders" ON public.orders;
CREATE POLICY "Tenant scope orders" ON public.orders AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant scope inquiries" ON public.leads_inquiries;
CREATE POLICY "Tenant scope inquiries" ON public.leads_inquiries AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()));

-- 6. Product catalogue access for company staff -----------------------------------
DROP POLICY IF EXISTS "Company staff read products" ON public.products;
CREATE POLICY "Company staff read products" ON public.products
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Inventory managers write products" ON public.products;
CREATE POLICY "Inventory managers write products" ON public.products
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
);

DROP POLICY IF EXISTS "Inventory managers update products" ON public.products;
CREATE POLICY "Inventory managers update products" ON public.products
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
);

DROP POLICY IF EXISTS "Inventory managers delete products" ON public.products;
CREATE POLICY "Inventory managers delete products" ON public.products
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin','store_manager'))
);

CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_key
ON public.products (company_id, sku) WHERE sku IS NOT NULL;