-- Extend subscription write protection to every tenant-owned operational module.
-- Existing tenant RLS remains enabled and unchanged.
DO $$
DECLARE
  tbl text;
  trg text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'leads_inquiries', 'team_members', 'communication_threads', 'messages',
    'call_logs', 'whatsapp_templates', 'whatsapp_campaign_logs', 'order_items'
  ]
  LOOP
    trg := tbl || '_subscription_guard';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trg, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_active()',
      trg, tbl
    );
  END LOOP;
END $$;