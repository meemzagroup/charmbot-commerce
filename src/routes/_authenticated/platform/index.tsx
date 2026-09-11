import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Package, Users, AlertTriangle, Plus, ExternalLink } from "lucide-react";
import { getPlatformOverview, getOwnerProjectLink } from "@/lib/platform.functions";
import { requirePlatformOwnerRoute } from "@/lib/platform-route-guard";

export const Route = createFileRoute("/_authenticated/platform/")({
  beforeLoad: requirePlatformOwnerRoute,
  head: () => ({
    meta: [
      { title: "Platform Dashboard | Manuta CRM" },
      { name: "description", content: "SaaS owner overview of companies, subscriptions and usage." },
      { property: "og:title", content: "Platform Dashboard | Manuta CRM" },
      { property: "og:description", content: "Companies, packages and subscription health at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlatformDashboard,
});

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function PlatformDashboard() {
  const overviewFn = useServerFn(getPlatformOverview);
  const { data, error } = useQuery({ queryKey: ["platform-overview"], queryFn: () => overviewFn({}) });
  const ownerLinkFn = useServerFn(getOwnerProjectLink);
  const { data: ownerLink } = useQuery({
    queryKey: ["owner-project-link"],
    queryFn: () => ownerLinkFn({}),
    retry: false,
  });

  if (error)
    return <p className="text-sm text-red-400">{(error as Error).message}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="display-title text-2xl">Platform Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manuta CRM · SaaS owner control centre</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link
            to="/platform/companies"
            className="inline-flex items-center gap-2 rounded-md bg-brand/15 text-brand px-3 py-2 text-sm font-medium"
          >
            <Plus className="size-4" /> Add company
          </Link>
          <Link
            to="/platform/packages"
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"
          >
            <Package className="size-4" /> Create package
          </Link>
          {ownerLink?.url && (
            <a
              href={ownerLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"
            >
              <ExternalLink className="size-4" /> Edit Project
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total companies" value={data?.totalCompanies ?? 0} />
        <Stat label="Active companies" value={data?.activeCompanies ?? 0} />
        <Stat label="Trial companies" value={data?.trialCompanies ?? 0} />
        <Stat label="Suspended" value={data?.suspendedCompanies ?? 0} />
        <Stat label="Expired subscriptions" value={data?.expiredSubscriptions ?? 0} tone="text-red-400" />
        <Stat label="Total users" value={data?.totalUsers ?? 0} />
        <Stat label="Active subscriptions" value={data?.activeSubscriptions ?? 0} />
        <Stat label="Monthly / annual value" value={`${data?.mrr ?? 0} / ${data?.arr ?? 0}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Package className="size-4 text-brand" /> Package distribution
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.distribution ?? []).map((d) => (
              <li key={d.name} className="flex justify-between text-muted-foreground">
                <span>{d.name}</span>
                <span className="text-foreground font-medium">{d.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="size-4 text-brand" /> Recently created
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.recentCompanies ?? []).map((c) => (
              <li key={c.id} className="flex justify-between text-muted-foreground">
                <span className="text-foreground">{c.name}</span>
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="size-4 text-brand" /> Upcoming expirations (30 days)
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.upcomingExpirations ?? []).length === 0 && (
              <li className="text-muted-foreground">None</li>
            )}
            {(data?.upcomingExpirations ?? []).map((c) => (
              <li key={c.id} className="flex justify-between text-muted-foreground">
                <span className="text-foreground">{c.name}</span>
                <span>{c.expiry ? new Date(c.expiry).toLocaleDateString() : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-line bg-panel p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-400" /> System alerts
        </h2>
        <ul className="mt-3 space-y-1 text-sm">
          {(data?.alerts ?? []).length === 0 && <li className="text-muted-foreground">All clear</li>}
          {(data?.alerts ?? []).map((a, i) => (
            <li key={i} className={a.level === "error" ? "text-red-400" : "text-amber-400"}>
              {a.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
