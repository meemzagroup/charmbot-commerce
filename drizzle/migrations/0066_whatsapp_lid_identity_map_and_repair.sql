-- WhatsApp "lid" (internal id) -> real phone identity mapping.
CREATE TABLE IF NOT EXISTS public.whatsapp_lid_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  whatsapp_channel_id uuid NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
  lid_key text NOT NULL,
  phone_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, whatsapp_channel_id, lid_key)
);

GRANT SELECT ON public.whatsapp_lid_map TO authenticated;
GRANT ALL ON public.whatsapp_lid_map TO service_role;

ALTER TABLE public.whatsapp_lid_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members read own lid map" ON public.whatsapp_lid_map;
CREATE POLICY "Company members read own lid map"
ON public.whatsapp_lid_map
FOR SELECT
TO authenticated
USING (company_id = public.current_company_id() OR public.is_super_admin(auth.uid()));

-- Observed lid -> phone pairs read from the live connected sessions.
INSERT INTO public.whatsapp_lid_map (company_id, whatsapp_channel_id, lid_key, phone_key)
SELECT c.company_id, c.id, v.lid_key, v.phone_key
FROM public.whatsapp_channels c
JOIN (VALUES
  ('228256238293074','923191067544'),
  ('196761142472733','923004356630'),
  ('188042828579040','923004901946'),
  ('188012193398945','923064688963'),
  ('211840856551678','923218400207'),
  ('181934948929758','923214119841'),
  ('47566829936785','923004131226'),
  ('122698676084745','923227762787'),
  ('43740685156572','923367773341'),
  ('205639276097649','923344526888'),
  ('83361238356021','923334394551'),
  ('122840762323170','923116155051'),
  ('73861290836204','923485387134'),
  ('263041178403054','923014292912'),
  ('28888705048732','923104040375')
) AS v(lid_key, phone_key) ON TRUE
WHERE c.instance_key = 'CEO'
ON CONFLICT (company_id, whatsapp_channel_id, lid_key) DO NOTHING;

-- Repair: move messages from internal-id threads onto the canonical
-- phone-keyed conversation, then drop only the now-empty shells.
DO $$
DECLARE
  r record;
  target uuid;
BEGIN
  FOR r IN
    SELECT t.id, t.company_id, t.whatsapp_channel_id, t.contact_name, m.phone_key
    FROM public.communication_threads t
    JOIN public.whatsapp_lid_map m
      ON m.company_id = t.company_id
     AND m.whatsapp_channel_id = t.whatsapp_channel_id
     AND m.lid_key = t.contact_key
    WHERE t.channel_type = 'whatsapp'
  LOOP
    SELECT id INTO target
    FROM public.communication_threads
    WHERE company_id = r.company_id
      AND channel_type = 'whatsapp'
      AND whatsapp_channel_id = r.whatsapp_channel_id
      AND contact_key = right(r.phone_key, 10)
      AND id <> r.id
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT 1;

    IF target IS NULL THEN
      -- No phone-keyed conversation yet: re-key this one in place so no
      -- message or timestamp is touched at all.
      UPDATE public.communication_threads
      SET contact_key = right(r.phone_key, 10), contact_handle = r.phone_key
      WHERE id = r.id;
    ELSE
      UPDATE public.messages SET thread_id = target WHERE thread_id = r.id;
      UPDATE public.communication_threads tgt
      SET last_message_at = GREATEST(tgt.last_message_at, src.last_message_at),
          unread_count = tgt.unread_count + src.unread_count,
          contact_id = COALESCE(tgt.contact_id, src.contact_id)
      FROM public.communication_threads src
      WHERE tgt.id = target AND src.id = r.id;
      DELETE FROM public.communication_threads
      WHERE id = r.id
        AND NOT EXISTS (SELECT 1 FROM public.messages WHERE thread_id = r.id);
    END IF;
  END LOOP;
END $$;