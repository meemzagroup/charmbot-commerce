ALTER TABLE public.communication_threads
  ADD COLUMN IF NOT EXISTS whatsapp_channel_id uuid REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL;

UPDATE public.communication_threads t
SET whatsapp_channel_id = wc.id
FROM public.whatsapp_channels wc
WHERE t.whatsapp_channel_id IS NULL
  AND t.channel_type = 'whatsapp'
  AND t.company_id = wc.company_id
  AND t.channel_number = wc.phone_number;

CREATE INDEX IF NOT EXISTS communication_threads_whatsapp_channel_idx
  ON public.communication_threads (company_id, whatsapp_channel_id, last_message_at DESC)
  WHERE channel_type = 'whatsapp';

CREATE UNIQUE INDEX IF NOT EXISTS messages_evolution_event_unique_idx
  ON public.messages (
    company_id,
    (metadata ->> 'instance'),
    (metadata ->> 'message_id')
  )
  WHERE metadata ->> 'instance' IS NOT NULL
    AND metadata ->> 'message_id' IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'communication_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.communication_threads;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END
$$;