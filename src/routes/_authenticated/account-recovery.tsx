import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountRecoveryAdmin } from "@/components/crm/AccountRecoveryAdmin";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/account-recovery")({
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw redirect({ to: "/auth" });
    const [{ data: profile }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("is_super_admin, company_id").eq("id", auth.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", auth.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (!profile?.is_super_admin && !(profile?.company_id && role)) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Account Recovery · Meemza CRM" },
      {
        name: "description",
        content:
          "Administrator tools to recover Meemza CRM accounts: look up login IDs, send password resets, unlock accounts and review the security audit log.",
      },
      { property: "og:title", content: "Account Recovery · Meemza CRM" },
      {
        property: "og:description",
        content: "Look up login IDs, send password resets and unlock team accounts securely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountRecoveryAdmin,
});
