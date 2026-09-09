CREATE OR REPLACE FUNCTION public.delete_order_atomic(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.order_items WHERE order_id = _order_id;
  DELETE FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_order_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_order_atomic(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_customer_atomic(_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.communication_threads SET contact_id = NULL WHERE contact_id = _customer_id;
  UPDATE public.orders SET customer_id = NULL WHERE customer_id = _customer_id;
  UPDATE public.leads_inquiries SET customer_id = NULL WHERE customer_id = _customer_id;
  DELETE FROM public.customers WHERE id = _customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found or access denied'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_customer_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_customer_atomic(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_call_atomic(
  _caller_name text,
  _caller_number text,
  _call_type text,
  _duration_seconds integer,
  _notes text DEFAULT NULL,
  _agent_id uuid DEFAULT NULL,
  _recording_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  thread_id uuid;
  member_id uuid;
BEGIN
  IF _call_type NOT IN ('Incoming', 'Outgoing', 'Missed') THEN
    RAISE EXCEPTION 'Invalid call type';
  END IF;
  IF _duration_seconds < 0 THEN RAISE EXCEPTION 'Duration cannot be negative'; END IF;
  member_id := COALESCE(_agent_id, (SELECT id FROM public.team_members WHERE user_id = auth.uid() LIMIT 1));

  INSERT INTO public.communication_threads (
    channel_type, contact_name, contact_handle, subject, assigned_to, status
  ) VALUES (
    'call', _caller_name, _caller_number, _call_type || ' call', member_id,
    CASE WHEN _call_type = 'Missed' THEN 'Open' ELSE 'In Progress' END
  ) RETURNING id INTO thread_id;

  INSERT INTO public.call_logs (
    thread_id, caller_name, caller_number, call_type, duration_seconds,
    status, notes, agent_id, recording_url
  ) VALUES (
    thread_id, _caller_name, _caller_number, _call_type, _duration_seconds,
    CASE WHEN _call_type = 'Missed' THEN 'Missed' ELSE 'Completed' END,
    _notes, member_id, _recording_url
  );

  INSERT INTO public.messages (thread_id, sender_type, sender_name, content)
  VALUES (
    thread_id, 'system', 'System',
    CASE WHEN _call_type = 'Missed' THEN 'Missed call logged'
      ELSE _call_type || ' call completed – ' || floor(_duration_seconds / 60)::text || 'm ' || lpad((_duration_seconds % 60)::text, 2, '0') || 's'
    END
  );
  RETURN thread_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_call_atomic(text,text,text,integer,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_call_atomic(text,text,text,integer,text,uuid,text) TO authenticated;