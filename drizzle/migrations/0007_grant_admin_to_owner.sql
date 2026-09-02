INSERT INTO public.user_roles (user_id, role)
SELECT '9eb0bf1f-bd27-49fd-a682-0cc1c8472a08'::uuid, 'admin'::app_role
ON CONFLICT (user_id, role) DO NOTHING;