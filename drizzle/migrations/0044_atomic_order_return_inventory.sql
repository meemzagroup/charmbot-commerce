CREATE OR REPLACE FUNCTION public.process_order_return(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_status text;
BEGIN
  SELECT order_status INTO current_status
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;
  IF current_status = 'Returned' THEN
    RAISE EXCEPTION 'Order has already been returned';
  END IF;
  IF current_status <> 'Delivered' THEN
    RAISE EXCEPTION 'Only delivered orders can be returned';
  END IF;

  UPDATE public.products p
  SET stock_quantity = p.stock_quantity + i.quantity
  FROM public.order_items i
  WHERE i.order_id = _order_id
    AND i.product_id = p.id;

  UPDATE public.orders
  SET order_status = 'Returned', payment_status = 'Refunded'
  WHERE id = _order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.process_order_return(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_order_return(uuid) TO authenticated;