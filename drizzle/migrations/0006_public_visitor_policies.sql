-- 1. Allow anonymous website visitors to submit chatbot conversations (insert-only, no read)
GRANT INSERT ON public.chatbot_conversations TO anon;

CREATE POLICY "Visitors can submit chatbot conversations"
ON public.chatbot_conversations
FOR INSERT
TO anon
WITH CHECK (
  session_id IS NOT NULL AND length(session_id) <= 200
);

-- 2. Allow anonymous visitors to submit lead/inquiry forms (insert-only, no read)
GRANT INSERT ON public.leads_inquiries TO anon;

CREATE POLICY "Visitors can submit inquiries"
ON public.leads_inquiries
FOR INSERT
TO anon
WITH CHECK (
  status = 'Open'
  AND length(coalesce(name, '')) <= 200
  AND length(coalesce(email, '')) <= 320
  AND length(coalesce(phone, '')) <= 40
  AND length(coalesce(message, '')) <= 5000
);

-- 3. Allow public/anonymous read access to the active product catalog
GRANT SELECT ON public.products TO anon;

CREATE POLICY "Public can view active products"
ON public.products
FOR SELECT
TO anon
USING (is_active = true);