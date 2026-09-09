import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPlatformAudit } from "@/lib/platform.functions";

export const Route = createFileRoute("/_authenticated/platform/audit")({
  head: () => ({
    meta: [
      { title: "Platform Audit Log · Manuta CRM" },
      { name: "description", content: "Every platform-owner action recorded for compliance." },
      { property: "og:title", content: "Platform Audit Log · Manuta CRM" },
      { property: "og:description", content: "Immutable record of platform owner activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const auditFn = useServerFn(listPlatformAudit);
  const { data = [], error } = useQuery({ queryKey: ["platform-audit"], queryFn: () => auditFn({}) });

  if (error) return <p className="text-sm text-red-400">{(error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <h1 className="display-title text-2xl">Audit Log</h1>
      <div className="rounded-lg border border-line bg-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b border-line">
            <tr>
              <th className="p-3">When</th>
              <th className="p-3">Actor</th>
              <th className="p-3">Action</th>
              <th className="p-3">Target</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: any) => (
              <tr key={row.id} className="border-b border-line/60">
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="p-3">{row.actor_email ?? row.actor_id}</td>
                <td className="p-3 font-medium">{row.action}</td>
                <td className="p-3 text-muted-foreground">
                  {row.target_type} {row.target_id?.slice(0, 8)}
                </td>
                <td className="p-3 text-muted-foreground max-w-[28rem] truncate">
                  {JSON.stringify(row.details)}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={5}>
                  No platform actions recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
