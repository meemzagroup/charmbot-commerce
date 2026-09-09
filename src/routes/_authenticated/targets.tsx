import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Target, Plus, Trash2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchOrders, fetchCustomers } from "@/lib/crm-queries";
import { fetchTeamMembers, fetchMyAccess } from "@/lib/comms-queries";
import {
  achievementFor,
  computePerformance,
  createRecoveryPlan,
  createTarget,
  currentMonthPeriod,
  deleteTarget,
  fetchRecoveryPlans,
  fetchTargets,
  RECOVERY_ACTIONS,
  RISK_CLASS,
  RISK_LABEL,
  setRecoveryPlanStatus,
  TARGET_METRICS,
  type TargetMetric,
  type TargetWithMember,
} from "@/lib/targets-queries";
import { currency, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/targets")({
  component: TargetsPage,
  head: () => ({
    meta: [
      { title: "Sales Targets & Performance | Manuta CRM" },
      {
        name: "description",
        content:
          "Track sales targets, achievement, required daily pace and performance risk for every team member.",
      },
      { property: "og:title", content: "Sales Targets & Performance | Manuta CRM" },
      {
        property: "og:description",
        content: "Targets, achievement pace and recovery plans for your sales team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const selectClass =
  "h-9 w-full rounded-md bg-panel2 border border-line px-2.5 text-sm text-foreground";

function formatValue(metric: string, value: number) {
  if (metric === "sales_amount") return currency(value);
  return Math.round(value).toLocaleString();
}

function TargetsPage() {
  const queryClient = useQueryClient();
  const { data: targets = [] } = useQuery({ queryKey: ["sales-targets"], queryFn: fetchTargets });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: members = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const { data: plans = [] } = useQuery({ queryKey: ["recovery-plans"], queryFn: fetchRecoveryPlans });

  const canManage = Boolean(access?.isSuperAdmin || access?.isCompanyAdmin);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sales-targets"] });
    queryClient.invalidateQueries({ queryKey: ["recovery-plans"] });
  };

  const period = currentMonthPeriod();
  const [memberId, setMemberId] = useState("");
  const [metric, setMetric] = useState<TargetMetric>("sales_amount");
  const [start, setStart] = useState(period.start);
  const [end, setEnd] = useState(period.end);
  const [value, setValue] = useState("");

  const add = useMutation({
    mutationFn: () =>
      createTarget({
        team_member_id: memberId || null,
        metric,
        period_start: start,
        period_end: end,
        target_value: Number(value || 0),
        notes: null,
      }),
    onSuccess: () => {
      setValue("");
      invalidate();
      toast.success("Target set");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTarget(id),
    onSuccess: () => {
      invalidate();
      toast.success("Target removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(
    () =>
      targets.map((t) => {
        const achieved = achievementFor(t, orders, customers);
        return { target: t, perf: computePerformance(Number(t.target_value), achieved, t.period_start, t.period_end) };
      }),
    [targets, orders, customers],
  );

  const atRisk = rows.filter((r) => r.perf.risk === "orange" || r.perf.risk === "red").length;
  const onTrack = rows.filter((r) => r.perf.risk === "green" || r.perf.risk === "blue").length;
  const openPlans = plans.filter((p) => p.status === "Open").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display-title text-2xl flex items-center gap-2">
          <Target className="size-5 text-brand" /> Sales Targets &amp; Performance
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every figure below is calculated from your own orders and customers. Working days exclude
          Sundays.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Targets tracked" value={String(rows.length)} />
        <SummaryCard label="On track" value={String(onTrack)} tone="text-teal" />
        <SummaryCard label="Behind pace" value={String(atRisk)} tone="text-orange-500" />
      </div>

      {canManage && (
        <div className="rounded-lg bg-panel border border-line p-6 space-y-4">
          <h2 className="display-title text-lg">Set a target</h2>
          <div className="grid gap-3 md:grid-cols-6 items-end">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="t_member">Who</Label>
              <select id="t_member" className={selectClass} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Whole company</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_metric">Measure</Label>
              <select id="t_metric" className={selectClass} value={metric} onChange={(e) => setMetric(e.target.value as TargetMetric)}>
                {TARGET_METRICS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_start">From</Label>
              <Input id="t_start" type="date" className="bg-panel2" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_end">To</Label>
              <Input id="t_end" type="date" className="bg-panel2" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_value">Target</Label>
              <Input id="t_value" type="number" min="0" className="bg-panel2" value={value} onChange={(e) => setValue(e.target.value)} placeholder="500000" />
            </div>
          </div>
          <Button onClick={() => add.mutate()} disabled={add.isPending || !value || !start || !end}>
            <Plus className="size-4" /> Add target
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {rows.length === 0 && (
          <div className="rounded-lg border border-line bg-panel px-4 py-10 text-center text-sm text-muted-foreground">
            No targets yet. {canManage ? "Add one above to start tracking pace." : "Ask your administrator to set your target."}
          </div>
        )}
        {rows.map(({ target, perf }) => (
          <TargetCard
            key={target.id}
            target={target}
            perf={perf}
            canManage={canManage}
            memberId={access?.memberId ?? null}
            plans={plans.filter((p) => p.target_id === target.id)}
            onDelete={() => remove.mutate(target.id)}
            onSaved={invalidate}
          />
        ))}
      </div>

      {openPlans > 0 && (
        <p className="text-xs text-muted-foreground">
          {openPlans} recovery {openPlans === 1 ? "plan is" : "plans are"} still open.
        </p>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-panel border border-line p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("display-title text-2xl mt-1", tone)}>{value}</div>
    </div>
  );
}

function TargetCard({
  target,
  perf,
  canManage,
  memberId,
  plans,
  onDelete,
  onSaved,
}: {
  target: TargetWithMember;
  perf: ReturnType<typeof computePerformance>;
  canManage: boolean;
  memberId: string | null;
  plans: Awaited<ReturnType<typeof fetchRecoveryPlans>>;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<string>(RECOVERY_ACTIONS[0]);
  const [commitment, setCommitment] = useState("");
  const [deadline, setDeadline] = useState(target.period_end);

  const metricLabel = TARGET_METRICS.find((m) => m.key === target.metric)?.label ?? target.metric;
  const needsPlan = perf.risk !== "green" && perf.risk !== "blue";
  const openPlan = plans.find((p) => p.status === "Open");
  const canRespond = canManage || (memberId !== null && memberId === target.team_member_id);

  const save = useMutation({
    mutationFn: () =>
      createRecoveryPlan({
        target_id: target.id,
        team_member_id: target.team_member_id,
        risk_level: perf.risk,
        gap_percent: Number(perf.gapPct.toFixed(2)),
        action,
        commitment: commitment || null,
        deadline: deadline || null,
      }),
    onSuccess: () => {
      setCommitment("");
      onSaved();
      toast.success("Recovery plan recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: (status: "Achieved" | "Missed") => setRecoveryPlanStatus(openPlan!.id, status),
    onSuccess: () => {
      onSaved();
      toast.success("Plan updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg bg-panel border border-line p-6 space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <div className="font-medium">
            {target.team_members?.full_name ?? "Whole company"} · {metricLabel}
          </div>
          <div className="text-xs text-muted-foreground">
            {shortDate(target.period_start)} – {shortDate(target.period_end)} ·{" "}
            {perf.workingDaysLeft} working {perf.workingDaysLeft === 1 ? "day" : "days"} left
          </div>
        </div>
        <span
          className={cn(
            "ml-auto text-[11px] uppercase tracking-wide rounded-full border px-2.5 py-1",
            RISK_CLASS[perf.risk],
            perf.risk === "red" && "motion-safe:animate-pulse",
          )}
        >
          {RISK_LABEL[perf.risk]}
        </span>
        {canManage && (
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete target">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        )}
      </div>

      <div>
        <div className="h-2 rounded-full bg-panel2 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              perf.risk === "green" || perf.risk === "blue" ? "bg-teal" : perf.risk === "red" ? "bg-red-500" : "bg-amber-500",
            )}
            style={{ width: `${Math.min(100, Math.max(0, perf.achievementPct))}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {formatValue(target.metric, perf.achieved)} of {formatValue(target.metric, perf.target)} ·{" "}
          {perf.achievementPct.toFixed(1)}% achieved, {perf.expectedPct.toFixed(1)}% expected by today
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <Stat label="Remaining" value={formatValue(target.metric, perf.remaining)} />
        <Stat label="Required daily pace" value={formatValue(target.metric, perf.requiredDailyPace)} />
        <Stat label="Projected at period end" value={formatValue(target.metric, perf.projected)} />
        <Stat label="Behind expected pace" value={`${Math.max(0, perf.gapPct).toFixed(1)}%`} />
      </div>

      {needsPlan && canRespond && !openPlan && (
        <div className="rounded-md border border-line bg-panel2/50 p-4 space-y-3">
          <div className="text-sm flex items-center gap-2">
            <ShieldAlert className="size-4 text-amber-500" />
            You are {perf.gapPct.toFixed(0)}% behind the required pace with {perf.workingDaysLeft}{" "}
            working days left. What is your recovery plan?
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select className={selectClass} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Recovery action">
              {RECOVERY_ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <Input
              className="bg-panel2"
              placeholder="What will you commit to?"
              value={commitment}
              onChange={(e) => setCommitment(e.target.value)}
              aria-label="Commitment"
            />
            <Input
              type="date"
              className="bg-panel2"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              aria-label="Deadline"
            />
          </div>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            Submit plan
          </Button>
        </div>
      )}

      {openPlan && (
        <div className="rounded-md border border-line bg-panel2/50 p-4 space-y-2">
          <div className="text-sm">
            <span className="font-medium">Recovery plan:</span> {openPlan.action}
            {openPlan.commitment ? ` — ${openPlan.commitment}` : ""}
          </div>
          <div className="text-xs text-muted-foreground">
            Due {shortDate(openPlan.deadline)} · recorded {shortDate(openPlan.created_at)}
          </div>
          {canManage && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => close.mutate("Achieved")}>
                <CheckCircle2 className="size-4" /> Recovered
              </Button>
              <Button size="sm" variant="outline" onClick={() => close.mutate("Missed")}>
                Not recovered
              </Button>
            </div>
          )}
        </div>
      )}

      {plans.filter((p) => p.status !== "Open").length > 0 && (
        <div className="text-xs text-muted-foreground">
          History:{" "}
          {plans
            .filter((p) => p.status !== "Open")
            .map((p) => `${p.action} (${p.status})`)
            .join(", ")}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-panel2/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}
