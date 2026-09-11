DROP INDEX IF EXISTS public.communication_threads_wa_contact_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS communication_threads_wa_identity_uniq
  ON public.communication_threads (company_id, whatsapp_channel_id, contact_key)
  WHERE channel_type = 'whatsapp'
    AND company_id IS NOT NULL
    AND whatsapp_channel_id IS NOT NULL
    AND contact_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS communication_threads_company_channel_contact_idx
  ON public.communication_threads (company_id, whatsapp_channel_id, contact_key);