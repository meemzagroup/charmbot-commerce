DROP TRIGGER IF EXISTS channels_set_company ON public.whatsapp_channels;

CREATE TRIGGER channels_set_company
BEFORE INSERT ON public.whatsapp_channels
FOR EACH ROW EXECUTE FUNCTION public.set_company_id();