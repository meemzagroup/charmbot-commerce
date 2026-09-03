import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/crm/AppSidebar";
import { ChatWidget } from "@/components/crm/ChatWidget";
import { fetchInquiries, fetchOrders } from "@/lib/crm-queries";
import { fetchMyAccess } from "@/lib/comms-queries";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const { data: orders } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const { data: inquiries } = useQuery({ queryKey: ["inquiries"], queryFn: fetchInquiries });
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });

  const pendingOrders = (orders ?? []).filter((o) =>
    ["Pending", "Processing"].includes(o.order_status),
  ).length;
  const openInquiries = (inquiries ?? []).filter((i) =>
    ["Open", "In Progress"].includes(i.status),
  ).length;

  const userName =
    (user.user_metadata as { full_name?: string })?.full_name ||
    user.email?.split("@")[0] ||
    "Operator";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-ink text-foreground flex">
      <AppSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        userName={userName}
        onSignOut={signOut}
        counts={{ orders: pendingOrders, inquiries: openInquiries }}
        isSuperAdmin={Boolean(access?.isSuperAdmin)}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 border-b border-line bg-panel/60 flex items-center px-8 gap-4">
          <div className="text-sm text-muted-foreground">
            Meemza <span className="mx-1 text-line">/</span>
            <span className="text-foreground">Operations</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <span className="size-2 rounded-full bg-teal live-dot" /> Live
            </div>
            <div className="hidden md:flex w-72 h-10 rounded-md bg-panel2 border border-line items-center px-3 gap-2 text-muted-foreground text-sm">
              <Search className="size-4" />
              <span>Search from any table below…</span>
            </div>
            <div className="size-9 rounded-full grid place-items-center bg-panel2 border border-line text-muted-foreground font-semibold text-sm">
              {openInquiries}
            </div>
          </div>
        </header>

        <div className="px-8 py-8 pb-28">
          <Outlet />
        </div>
      </main>

      <ChatWidget />
    </div>
  );
}
