-- 1) Explicitly deny anon UPDATE/DELETE on leads_inquiries (fail-closed, made explicit)
DROP POLICY IF EXISTS "Anon cannot update inquiries" ON public.leads_inquiries;
CREATE POLICY "Anon cannot update inquiries"
ON public.leads_inquiries
AS RESTRICTIVE
FOR UPDATE
TO anon
USING (false);

DROP POLICY IF EXISTS "Anon cannot delete inquiries" ON public.leads_inquiries;
CREATE POLICY "Anon cannot delete inquiries"
ON public.leads_inquiries
AS RESTRICTIVE
FOR DELETE
TO anon
USING (false);

-- 2) Tighten the anon INSERT policy: require a contact method, lock inquiry_type and source to allowed values
DROP POLICY IF EXISTS "Visitors can submit inquiries" ON public.leads_inquiries;
CREATE POLICY "Visitors can submit inquiries"
ON public.leads_inquiries
FOR INSERT
TO anon
WITH CHECK (
  customer_id IS NULL
  AND status = 'Open'
  AND inquiry_type IN ('General', 'Pricing', 'Bulk Order', 'Product Question', 'Support', 'Feedback')
  AND source IN ('Website', 'Chatbot', 'Web Chat')
  AND (phone IS NOT NULL OR email IS NOT NULL)
  AND (name IS NULL OR char_length(name) BETWEEN 1 AND 200)
  AND (phone IS NULL OR char_length(phone) BETWEEN 5 AND 50)
  AND (email IS NULL OR (char_length(email) <= 320 AND POSITION('@' IN email) > 1))
  AND (message IS NULL OR char_length(message) <= 5000)
);