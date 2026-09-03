import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Boxes,
  MessagesSquare,
  Inbox,
  Settings,
  PanelLeftClose,
  PanelLeft,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/inbox", label: "Omnichannel / Inbox", icon: Inbox },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/products", label: "Inventory", icon: Boxes },
  { to: "/inquiries", label: "Inquiries", icon: MessagesSquare },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppSidebar({
  collapsed,
  onToggle,
  userName,
  onSignOut,
  counts,
  isSuperAdmin = false,
}: {
  collapsed: boolean;
  onToggle: () => void;
  userName: string;
  onSignOut: () => void;
  counts: { orders?: number; inquiries?: number };
  isSuperAdmin?: boolean;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-line bg-panel flex flex-col transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div className="px-4 py-6 border-b border-line flex items-start gap-2">
        {!collapsed && (
          <div className="min-w-0 pl-2">
            <div className="display-title text-xl leading-none">
              MEEMZA<span className="text-brand">·</span>CRM
            </div>
            <div className="eyebrow mt-1.5">E-commerce Command</div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.filter((item) => isSuperAdmin || item.to !== "/settings").map((item) => {
          const active = pathname === item.to;
          const badge =
            item.to === "/orders"
              ? counts.orders
              : item.to === "/inquiries"
                ? counts.inquiries
                : undefined;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-panel2 text-foreground font-medium border-l-2 border-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", active && "text-brand")} />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && badge ? (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-brand/15 text-brand font-semibold">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-line">
        <div className="flex items-center gap-3">
          <div className="size-9 shrink-0 rounded-full grid place-items-center bg-brand/20 text-brand font-display font-semibold">
            {initials || "MZ"}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{userName}</div>
              <div className="text-[11px] text-muted-foreground">Store Manager</div>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
