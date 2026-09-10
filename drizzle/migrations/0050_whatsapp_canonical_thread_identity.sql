-- Canonical WhatsApp conversation identity: company + channel + normalized contact.
CREATE OR REPLACE FUNCTION public.wa_contact_key(_handle text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _handle IS NULL OR btrim(_handle) = '' THEN NULL
    WHEN length(regexp_replace(split_part(split_part(_handle, '@', 1), ':', 1), '[^0-9]', '', 'g')) >= 13
      THEN regexp_replace(split_part(split_part(_handle, '@', 1), ':', 1), '[^0-9]', '', 'g')
    WHEN length(regexp_replace(split_part(split_part(_handle, '@', 1), ':', 1), '[^0-9]', '', 'g')) = 0
      THEN lower(btrim(_handle))
    ELSE right(regexp_replace(split_part(split_part(_handle, '@', 1), ':', 1), '[^0-9]', '', 'g'), 10)
  END
$$;

ALTER TABLE public.communication_threads
  ADD COLUMN IF NOT EXISTS contact_key text;

UPDATE public.communication_threads
  SET contact_key = public.wa_contact_key(contact_handle)
  WHERE contact_key IS NULL;

CREATE OR REPLACE FUNCTION public.set_thread_contact_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.contact_key := public.wa_contact_key(NEW.contact_handle);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_thread_contact_key ON public.communication_threads;
CREATE TRIGGER trg_thread_contact_key
  BEFORE INSERT OR UPDATE OF contact_handle ON public.communication_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_thread_contact_key();

CREATE INDEX IF NOT EXISTS communication_threads_contact_key_idx
  ON public.communication_threads (company_id, whatsapp_channel_id, contact_key);

CREATE INDEX IF NOT EXISTS messages_provider_id_idx
  ON public.messages (company_id, (metadata->>'message_id'));
