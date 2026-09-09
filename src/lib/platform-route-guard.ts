import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export async function requirePlatformOwnerRoute() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw redirect({ to: "/auth" });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.is_super_admin) throw redirect({ to: "/" });
}