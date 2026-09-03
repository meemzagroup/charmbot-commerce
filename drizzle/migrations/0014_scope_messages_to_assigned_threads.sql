DROP POLICY IF EXISTS "Messages follow thread access" ON public.messages;

CREATE POLICY "Messages follow assigned thread access"
ON public.messages
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.id = messages.thread_id
      AND (
        t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
        OR (
          t.channel_number IS NOT NULL
          AND t.channel_number IN (
            SELECT wc.phone_number
            FROM public.whatsapp_channels wc
            JOIN public.team_members tm ON tm.id = wc.team_member_id
            WHERE tm.user_id = auth.uid()
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_super_admin)
  OR EXISTS (
    SELECT 1 FROM public.communication_threads t
    WHERE t.id = messages.thread_id
      AND (
        t.assigned_to IN (SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid())
        OR (
          t.channel_number IS NOT NULL
          AND t.channel_number IN (
            SELECT wc.phone_number
            FROM public.whatsapp_channels wc
            JOIN public.team_members tm ON tm.id = wc.team_member_id
            WHERE tm.user_id = auth.uid()
          )
        )
      )
  )
);