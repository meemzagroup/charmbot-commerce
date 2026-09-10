CREATE UNIQUE INDEX IF NOT EXISTS communication_threads_wa_identity_uniq
  ON public.communication_threads (company_id, whatsapp_channel_id, contact_key)
  WHERE channel_type = 'whatsapp'
    AND company_id IS NOT NULL
    AND whatsapp_channel_id IS NOT NULL
    AND contact_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS messages_thread_provider_id_uniq
  ON public.messages (thread_id, (metadata->>'message_id'))
  WHERE metadata->>'message_id' IS NOT NULL;
