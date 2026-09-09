import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tmpdiag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        void request;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const removed: string[] = [];
        for (const u of data.users) {
          if ((u.email ?? "").startsWith("tenanta.admin+")) {
            await supabaseAdmin.auth.admin.deleteUser(u.id);
            removed.push(u.email ?? u.id);
          }
        }
        return new Response(JSON.stringify({ removed }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
