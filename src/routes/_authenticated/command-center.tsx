import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Siren, RefreshCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyRow, PageHeader, Panel, Pill, StatCard } from "@/components/crm/WorkforceUI";
import { fetchMyAccess, fetchTeamMembers } from "@/lib/comms-queries";
import { listRows, updateRow } from "@/lib/workforce-queries";
import { runSalforceEngine } from "@/lib/salforce-engine";
import { relativeTime, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/command-center")({
  component: CommandCenterPage,
  head: () => ({
    meta: [
      { title: "Command Center | Salforce AI" },
      {
        name: "description",
        content:
          "The System-as-Boss control room: automated monitoring, reminders, escalations, deadlines and a full audit history of every workforce decision.",
      },
      { property: "og:title", content: "Command Center | Salforce AI" },
      { property: "og:description", content: "Automated monitoring, escalation and audit history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function CommandCenterPage() {
  const qc = useQueryClient();
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const canManage = Boolean(access?.isSuperAdmin || access?.isCompanyAdmin);

  const { data: members = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });
  const { data: alerts = [], isLoading } = useQuery({ queryKey: ["system-alerts"], queryFn: () => listRows("system_alerts") });
  const { data: actions = [] } = useQuery({ queryKey: ["performance-actions"], queryFn: () => listRows("performance_actions") });
  const { data: history = [] } = useQuery({ queryKey: ["workforce-audit"], queryFn: () => listRows("workforce_audit_logs") });

  const invalidate = () =>
    ["system-alerts", "performance-actions", "workforce-audit"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const run = useMutation({
    mutationFn: runSalforceEngine,
    onSuccess: (r) => {
      invalidate();
      toast.success(
        `Monitoring complete — ${r.alertsRaised} live finding(s), ${r.alertsResolved} auto-resolved, ${r.actionsIssued} escalation(s) issued`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAlertStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateRow("system_alerts", id, {
        status,
        resolved_at: status === "Resolved" ? new Date().toISOString() : null,
      }),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = alerts.filter((a) => a.status === "Open" || a.status === "Acknowledged");
  const critical = open.filter((a) => a.severity === "critical");
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Siren}
        title="Command Center"
        subtitle="The system monitors targets, attendance, journey plans, visits, recovery, training and documents — then reminds, warns and escalates."
        actions={
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            <RefreshCw className={run.isPending ? "size-4 animate-spin" : "size-4"} /> Run monitoring now
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Live findings" value={String(open.length)} />
        <StatCard label="Critical" value={String(critical.length)} tone={critical.length ? "text-red-400" : undefined} />
        <StatCard label="Open escalations" value={String(actions.filter((a) => a.status !== "Closed").length)} tone="text-amber-500" />
        <StatCard label="Auto-resolved" value={String(alerts.filter((a) => a.status === "Resolved").length)} tone="text-teal" />
      </div>

      <Panel title="Active findings" description="Deduplicated by source, auto-resolved as soon as the underlying condition clears.">
        {isLoading && <EmptyRow>Loading…</EmptyRow>}
        {!isLoading && open.length === 0 && (
          <EmptyRow>Nothing open. Run monitoring to re-evaluate the whole workforce.</EmptyRow>
        )}
        <div className="space-y-2">
          {open
            .slice()
            .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
            .map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.detail}</div>
                </div>
                <Pill tone={a.severity === "critical" ? "red" : a.severity === "warning" ? "amber" : "blue"}>{a.severity}</Pill>
                {a.due_date ? <span className="text-xs text-muted-foreground">due {shortDate(a.due_date)}</span> : null}
                <div className="ml-auto flex gap-2">
                  {a.status === "Open" && (
                    <Button size="sm" variant="secondary" onClick={() => setAlertStatus.mutate({ id: a.id, status: "Acknowledged" })}>
                      Acknowledge
                    </Button>
                  )}
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setAlertStatus.mutate({ id: a.id, status: "Dismissed" })}>
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </Panel>

      <Panel title="Escalation ladder" description="Reminder → Warning → Final Warning → PIP → Termination recommendation.">
        {actions.filter((a) => a.auto_generated).length === 0 && (
          <EmptyRow>No system-issued escalations. Findings escalate only when they stay critical.</EmptyRow>
        )}
        <div className="space-y-2">
          {actions
            .filter((a) => a.auto_generated)
            .map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                <span className="font-medium">{memberName(a.team_member_id)}</span>
                <Pill tone={a.level >= 4 ? "red" : a.level >= 2 ? "amber" : "blue"}>L{a.level} {a.action_type}</Pill>
                <span className="text-xs text-muted-foreground">{a.reason}</span>
                {a.deadline ? <span className="ml-auto text-xs text-muted-foreground">due {shortDate(a.deadline)}</span> : null}
              </div>
            ))}
        </div>
      </Panel>

      <Panel title="Audit history" description="Every create, update and delete across the workforce modules.">
        {history.length === 0 && <EmptyRow>No activity recorded yet.</EmptyRow>}
        <div className="space-y-1">
          {history.slice(0, 40).map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel2 px-3 py-1.5 text-xs">
              <History className="size-3 text-muted-foreground" />
              <span className="font-medium">{h.action}</span>
              <span className="text-muted-foreground">{h.entity.replace(/_/g, " ")}</span>
              <span className="ml-auto text-muted-foreground">{relativeTime(h.created_at)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function severityRank(s: string) {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}
