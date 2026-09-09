import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const selectClass =
  "h-9 w-full rounded-md bg-panel2 border border-line px-2.5 text-sm text-foreground";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0">
        <h1 className="display-title text-2xl flex items-center gap-2">
          <Icon className="size-5 text-gold" /> {title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>
      {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg bg-panel border border-line p-5 space-y-4", className)}>
      {title ? (
        <header>
          <h2 className="font-medium">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: string; tone?: string | undefined }) {
  return (
    <div className="rounded-lg bg-panel border border-line p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("display-title text-xl mt-1", tone)}>{value}</div>
    </div>
  );
}

export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "muted" | "blue"; children: ReactNode }) {
  const map = {
    green: "border-teal/40 bg-teal/10 text-teal",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-500",
    red: "border-red-500/50 bg-red-500/10 text-red-400",
    blue: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    muted: "border-line bg-panel2 text-muted-foreground",
  } as const;
  return (
    <span className={cn("text-[11px] uppercase tracking-wide rounded-full border px-2.5 py-1", map[tone])}>
      {children}
    </span>
  );
}
