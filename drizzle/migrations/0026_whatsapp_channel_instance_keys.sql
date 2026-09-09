ALTER TABLE public.whatsapp_channels
  ADD COLUMN IF NOT EXISTS instance_key text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS team_name text,
  ADD COLUMN IF NOT EXISTS last_connected_at timestamptz;

UPDATE public.whatsapp_channels
SET instance_key = label
WHERE instance_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_channels_instance_key_uidx
  ON public.whatsapp_channels (instance_key);