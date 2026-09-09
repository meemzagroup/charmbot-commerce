-- The signup trigger runs as supabase_auth_admin. Earlier hardening revoked
-- EXECUTE from everyone but postgres/service_role, which broke account creation
-- with "Database error creating new user". Grant only the auth admin role back;
-- app roles (anon/authenticated) stay revoked.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;