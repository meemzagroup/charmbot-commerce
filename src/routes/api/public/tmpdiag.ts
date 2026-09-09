import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tmpdiag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        void request;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: `diag${Date.now()}@example.com`,
          password: "Diag!12345678",
          email_confirm: true,
        });
        if (data?.user?.id) await supabaseAdmin.auth.admin.deleteUser(data.user.id);
        return new Response(JSON.stringify({ ok: !error, error }, null, 2), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
