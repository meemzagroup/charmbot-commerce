import { createFileRoute, Outlet, redirect, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, Menu, LayoutDashboard, Inbox as InboxIcon, Users, ClipboardList, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/crm/AppSidebar";
import { ChatWidget } from "@/components/crm/ChatWidget";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { fetchInquiries, fetchOrders } from "@/lib/crm-queries";
import { fetchMyAccess } from "@/lib/comms-queries";
import { useServerFn } from "@tanstack/react-start";
import { getRecoveryAdminScope } from "@/lib/admin-recovery.functions";
import { getMyPlan } from "@/lib/plan.functions";
import { I18nProvider } from "@/lib/i18n";
import { ThemeToggle } from "@/components/crm/ThemeToggle";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_reset_password")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile?.must_reset_password) throw redirect({ to: "/reset-password" });
    return { user: data.user };
  },
  component: DashboardLayout,
});

const MOBILE_TABS = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/orders", label: "Orders", icon: ClipboardList },
] as const;

function DashboardLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const { data: orders } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const { data: inquiries } = useQuery({ queryKey: ["inquiries"], queryFn: fetchInquiries });
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const planFn = useServerFn(getMyPlan);
  const { data: plan } = useQuery({ queryKey: ["my-plan"], queryFn: () => planFn({}) });
  const recoveryScopeFn = useServerFn(getRecoveryAdminScope);
  const { data: recoveryScope } = useQuery({
    queryKey: ["recovery-scope"],
    queryFn: () => recoveryScopeFn({}),
  });

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

  const sidebarProps = {
    userName,
    onSignOut: signOut,
    counts: { orders: pendingOrders, inquiries: openInquiries },
    isSuperAdmin: Boolean(access?.isSuperAdmin),
    isCompanyAdmin: Boolean(access?.isCompanyAdmin),
    isRecoveryAdmin: Boolean(recoveryScope),
    modules: plan?.modules ?? {},
    companyName: plan?.companyName ?? null,
    logoUrl: plan?.logoUrl ?? null,
  };

  return (
    <I18nProvider companyDefault={plan?.language ?? "en"}>
      <div className="min-h-screen bg-ink text-foreground flex">
        {/* Desktop sidebar — unchanged */}
        {!isMobile && (
          <AppSidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
            {...sidebarProps}
          />
        )}

        {/* Mobile slide-out drawer */}
        {isMobile && (
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent
              side="left"
              className="w-[86%] max-w-[300px] p-0 bg-panel border-line overflow-y-auto"
            >
              <AppSidebar
                collapsed={false}
                onToggle={() => setDrawerOpen(false)}
                mobile
                onNavigate={() => setDrawerOpen(false)}
                {...sidebarProps}
              />
            </SheetContent>
          </Sheet>
        )}

        <main className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-panel/95 backdrop-blur supports-[backdrop-filter]:bg-panel/80 flex items-center gap-3 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:h-16 md:py-0 md:px-8 md:gap-4">
            {isMobile && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <Menu className="size-5" />
              </button>
            )}
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground md:gap-3">
              {plan?.logoUrl && (
                <img
                  src={plan.logoUrl}
                  alt={`${plan.companyName ?? "Company"} logo`}
                  className="size-8 shrink-0 rounded-md object-contain bg-panel2 border border-line"
                />
              )}
              <span className="truncate">
                <span className="truncate">{plan?.companyName ?? "Workspace"}</span>
                <span className="mx-1 text-line hidden sm:inline">/</span>
                <span className="text-foreground hidden sm:inline">Operations</span>
              </span>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-4">
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground font-medium">
                <span className="size-2 rounded-full bg-teal live-dot" /> Live
              </div>
              <div className="hidden md:flex w-72 h-10 rounded-md bg-panel2 border border-line items-center px-3 gap-2 text-muted-foreground text-sm">
                <Search className="size-4" />
                <span>Search from any table below…</span>
              </div>
              <ThemeToggle />
              <div className="size-9 shrink-0 rounded-full grid place-items-center bg-panel2 border border-line text-muted-foreground font-semibold text-sm">
                {openInquiries}
              </div>
            </div>
          </header>

          {plan && !plan.active && !plan.isSuperAdmin && (
            <div className="mx-4 mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 md:mx-8 md:mt-6">
              Subscription expired — contact administrator / renew subscription. Your data is safe; the
              workspace is read-only until the subscription is reactivated.
            </div>
          )}

          <div className="px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 md:pb-28">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom navigation */}
        {isMobile && (
          <nav
            aria-label="Primary"
            className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-panel/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
          >
            {MOBILE_TABS.map((tab) => {
              const active = pathname === tab.to;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-label={tab.label}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px]",
                    active ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  <tab.icon className="size-5" />
                  {tab.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="More"
              className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground"
            >
              <MoreHorizontal className="size-5" />
              More
            </button>
          </nav>
        )}

        {/* On phones the inbox reply bar needs the bottom-right corner, so the
            assistant launcher stays out of the way there. */}
        {!(isMobile && pathname.startsWith("/inbox")) && <ChatWidget />}
      </div>
    </I18nProvider>
  );
}
