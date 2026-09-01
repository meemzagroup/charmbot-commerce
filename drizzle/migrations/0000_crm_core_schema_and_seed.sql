-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'store_manager', 'support_agent');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'store_manager',
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'store_manager')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  shipping_address text,
  total_orders integer NOT NULL DEFAULT 0,
  total_spend numeric NOT NULL DEFAULT 0,
  customer_tag text NOT NULL DEFAULT 'New',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sku text UNIQUE,
  price numeric NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_status text NOT NULL DEFAULT 'Pending',
  payment_status text NOT NULL DEFAULT 'Pending',
  total_amount numeric NOT NULL DEFAULT 0,
  tracking_number text,
  courier_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage orders" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage order items" ON public.order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ INQUIRIES ============
CREATE TABLE public.leads_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  name text,
  phone text,
  email text,
  message text,
  inquiry_type text NOT NULL DEFAULT 'General',
  status text NOT NULL DEFAULT 'Open',
  source text NOT NULL DEFAULT 'Website',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads_inquiries TO authenticated;
GRANT ALL ON public.leads_inquiries TO service_role;
ALTER TABLE public.leads_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage inquiries" ON public.leads_inquiries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.chatbot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  visitor_phone text,
  visitor_email text,
  inquiry_topic text,
  full_transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_resolved_by_bot boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX chatbot_conversations_session_idx ON public.chatbot_conversations (session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_conversations TO authenticated;
GRANT ALL ON public.chatbot_conversations TO service_role;
ALTER TABLE public.chatbot_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read conversations" ON public.chatbot_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ SETTINGS ============
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage settings" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.app_settings (key, value) VALUES
  ('ai_provider', 'lovable'),
  ('bot_greeting', 'Hi! Track an order, ask about products, or reach a human agent.'),
  ('openai_api_key', ''),
  ('gemini_api_key', '');

-- ============ SEED DATA ============
INSERT INTO public.customers (id, full_name, email, phone, shipping_address, total_orders, total_spend, customer_tag, created_at) VALUES
 ('c0000001-0000-4000-8000-000000000001','Zara Ahmed','zara@khantextiles.pk','+92 300 1234567','12 Industrial Ave, Karachi',6,184200,'VIP', now() - interval '210 days'),
 ('c0000001-0000-4000-8000-000000000002','Bilal Khan','bilal@rahmancoat.pk','+92 301 7654321','Plot 44, SITE Area, Lahore',4,96400,'Repeat', now() - interval '160 days'),
 ('c0000001-0000-4000-8000-000000000003','Sana Malik','sana@malikpolymers.pk','+92 321 5559090','7 Mill Road, Faisalabad',3,61250,'Repeat', now() - interval '120 days'),
 ('c0000001-0000-4000-8000-000000000004','Omar Farooq','omar@omartraders.pk','+92 333 2224488','88 Bund Road, Multan',2,18900,'New', now() - interval '40 days'),
 ('c0000001-0000-4000-8000-000000000005','Hina Sheikh','hina@sheikhlabs.pk','+92 345 1112233','Block C, Korangi, Karachi',1,7400,'At Risk', now() - interval '300 days'),
 ('c0000001-0000-4000-8000-000000000006','Imran Qureshi','imran@qcoatings.pk','+92 302 9988776','Sundar Estate, Lahore',5,132000,'VIP', now() - interval '250 days');

INSERT INTO public.products (id, title, sku, price, stock_quantity, category, is_active, created_at) VALUES
 ('a0000001-0000-4000-8000-000000000001','Industrial Solvent A-200 · 5L','MZ-SOL-A200',12050,148,'Solvents',true, now() - interval '400 days'),
 ('a0000001-0000-4000-8000-000000000002','Catalyst Powder CP-9 · 25kg','MZ-CAT-CP9',15500,42,'Catalysts',true, now() - interval '380 days'),
 ('a0000001-0000-4000-8000-000000000003','Base Emulsion BE-4 · 20L','MZ-EMU-BE4',9200,7,'Emulsions',true, now() - interval '360 days'),
 ('a0000001-0000-4000-8000-000000000004','Surface Cleaner SC-7 · 10L','MZ-CLN-SC7',9400,96,'Cleaners',true, now() - interval '300 days'),
 ('a0000001-0000-4000-8000-000000000005','Acetone Technical Grade · 20L','MZ-ACE-TG20',8600,4,'Solvents',true, now() - interval '280 days'),
 ('a0000001-0000-4000-8000-000000000006','Titanium Dioxide TX-1 · 25kg','MZ-PIG-TX1',21400,63,'Pigments',true, now() - interval '240 days'),
 ('a0000001-0000-4000-8000-000000000007','Caustic Soda Flakes · 50kg','MZ-ALK-CS50',7300,120,'Alkalis',true, now() - interval '200 days'),
 ('a0000001-0000-4000-8000-000000000008','Defoamer DF-3 · 5L','MZ-ADD-DF3',6100,0,'Additives',false, now() - interval '150 days');

INSERT INTO public.orders (id, order_number, customer_id, order_status, payment_status, total_amount, tracking_number, courier_name, notes, created_at) VALUES
 ('b0000001-0000-4000-8000-000000000001','1042','c0000001-0000-4000-8000-000000000001','Shipped','Paid',48200,'TRK-9821','Redline Courier','Deliver to gate 3', now() - interval '2 days'),
 ('b0000001-0000-4000-8000-000000000002','1041','c0000001-0000-4000-8000-000000000002','Processing','COD',31000,NULL,NULL,NULL, now() - interval '3 days'),
 ('b0000001-0000-4000-8000-000000000003','1040','c0000001-0000-4000-8000-000000000003','Delivered','Paid',27600,'TRK-9310','Redline Courier',NULL, now() - interval '6 days'),
 ('b0000001-0000-4000-8000-000000000004','1039','c0000001-0000-4000-8000-000000000004','Pending','COD',9400,NULL,NULL,'Customer will confirm quantity', now() - interval '1 days'),
 ('b0000001-0000-4000-8000-000000000005','1038','c0000001-0000-4000-8000-000000000006','Delivered','Paid',64200,'TRK-9188','TCS',NULL, now() - interval '9 days'),
 ('b0000001-0000-4000-8000-000000000006','1037','c0000001-0000-4000-8000-000000000001','Delivered','Paid',43000,'TRK-9042','TCS',NULL, now() - interval '13 days'),
 ('b0000001-0000-4000-8000-000000000007','1036','c0000001-0000-4000-8000-000000000005','Returned','Refunded',7400,'TRK-8890','Leopards','Damaged drum on arrival', now() - interval '18 days'),
 ('b0000001-0000-4000-8000-000000000008','1035','c0000001-0000-4000-8000-000000000002','Cancelled','Refunded',12050,NULL,NULL,'Duplicate order', now() - interval '21 days'),
 ('b0000001-0000-4000-8000-000000000009','1034','c0000001-0000-4000-8000-000000000003','Delivered','Paid',33650,'TRK-8701','TCS',NULL, now() - interval '24 days'),
 ('b0000001-0000-4000-8000-000000000010','1033','c0000001-0000-4000-8000-000000000006','Delivered','Paid',67800,'TRK-8544','Redline Courier',NULL, now() - interval '28 days'),
 ('b0000001-0000-4000-8000-000000000011','1032','c0000001-0000-4000-8000-000000000004','Delivered','Paid',9500,'TRK-8402','Leopards',NULL, now() - interval '33 days'),
 ('b0000001-0000-4000-8000-000000000012','1031','c0000001-0000-4000-8000-000000000001','Delivered','Paid',92000,'TRK-8215','TCS','Bulk quarterly order', now() - interval '39 days');

INSERT INTO public.order_items (order_id, product_id, quantity, unit_price) VALUES
 ('b0000001-0000-4000-8000-000000000001','a0000001-0000-4000-8000-000000000001',4,12050),
 ('b0000001-0000-4000-8000-000000000002','a0000001-0000-4000-8000-000000000002',2,15500),
 ('b0000001-0000-4000-8000-000000000003','a0000001-0000-4000-8000-000000000003',3,9200),
 ('b0000001-0000-4000-8000-000000000004','a0000001-0000-4000-8000-000000000004',1,9400),
 ('b0000001-0000-4000-8000-000000000005','a0000001-0000-4000-8000-000000000006',3,21400),
 ('b0000001-0000-4000-8000-000000000006','a0000001-0000-4000-8000-000000000007',2,7300),
 ('b0000001-0000-4000-8000-000000000006','a0000001-0000-4000-8000-000000000002',1,15500),
 ('b0000001-0000-4000-8000-000000000006','a0000001-0000-4000-8000-000000000001',1,12050),
 ('b0000001-0000-4000-8000-000000000007','a0000001-0000-4000-8000-000000000004',1,7400),
 ('b0000001-0000-4000-8000-000000000008','a0000001-0000-4000-8000-000000000001',1,12050),
 ('b0000001-0000-4000-8000-000000000009','a0000001-0000-4000-8000-000000000005',2,8600),
 ('b0000001-0000-4000-8000-000000000009','a0000001-0000-4000-8000-000000000006',1,16450),
 ('b0000001-0000-4000-8000-000000000010','a0000001-0000-4000-8000-000000000006',2,21400),
 ('b0000001-0000-4000-8000-000000000010','a0000001-0000-4000-8000-000000000002',1,25000),
 ('b0000001-0000-4000-8000-000000000011','a0000001-0000-4000-8000-000000000004',1,9500),
 ('b0000001-0000-4000-8000-000000000012','a0000001-0000-4000-8000-000000000001',5,12050),
 ('b0000001-0000-4000-8000-000000000012','a0000001-0000-4000-8000-000000000007',4,7300);

INSERT INTO public.leads_inquiries (customer_id, name, phone, email, message, inquiry_type, status, source, created_at) VALUES
 ('c0000001-0000-4000-8000-000000000001','Zara Ahmed','+92 300 1234567','zara@khantextiles.pk','Where is order 1042? Need it before Friday.','Order Tracking','In Progress','Chatbot', now() - interval '4 hours'),
 (NULL,'Faisal Nadeem','+92 311 4455667','faisal@nadeemind.pk','Need bulk pricing for 500L of Solvent A-200.','Wholesale/Bulk','Open','Chatbot', now() - interval '9 hours'),
 ('c0000001-0000-4000-8000-000000000005','Hina Sheikh','+92 345 1112233','hina@sheikhlabs.pk','Drum arrived damaged, requesting refund.','Return/Refund','Open','WhatsApp', now() - interval '1 days'),
 (NULL,'Adnan Raza','+92 336 7788990','adnan@razapaints.pk','Is Defoamer DF-3 back in stock?','Product Inquiry','Open','Website', now() - interval '2 days'),
 ('c0000001-0000-4000-8000-000000000003','Sana Malik','+92 321 5559090','sana@malikpolymers.pk','Do you offer COD above 50,000?','General','Resolved','Chatbot', now() - interval '5 days');

INSERT INTO public.chatbot_conversations (session_id, visitor_phone, visitor_email, inquiry_topic, full_transcript, is_resolved_by_bot, created_at) VALUES
 ('sess-9f21','+92 300 1234567','zara@khantextiles.pk','Order Tracking','[{"role":"user","content":"Status of #1042"},{"role":"assistant","content":"Order #1042 has been Shipped via Redline Courier. Tracking ID: TRK-9821."}]'::jsonb,true, now() - interval '4 hours'),
 ('sess-7c04','+92 311 4455667',NULL,'Wholesale/Bulk','[{"role":"user","content":"Bulk price for 500L A-200?"},{"role":"assistant","content":"I have logged a bulk inquiry, our team will contact you shortly."}]'::jsonb,false, now() - interval '9 hours'),
 ('sess-4b88',NULL,'adnan@razapaints.pk','Product Inquiry','[{"role":"user","content":"Is DF-3 in stock?"},{"role":"assistant","content":"Defoamer DF-3 is currently out of stock. I have created a restock inquiry for you."}]'::jsonb,false, now() - interval '2 days');
