DROP POLICY IF EXISTS "Privileged staff insert order items" ON public.order_items;
CREATE POLICY "Privileged staff insert order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'store_manager', 'support_agent')
  )
);