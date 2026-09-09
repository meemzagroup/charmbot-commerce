import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gauge, Plus, ShieldAlert, GraduationCap, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyRow, PageHeader, Panel, Pill, StatCard, selectClass } from "@/components/crm/WorkforceUI";
import { fetchMyAccess, fetchTeamMembers } from "@/lib/comms-queries";
import { fetchOrders } from "@/lib/crm-queries";
import { supabase } from "@/integrations/supabase/client";
import { insertRow, letterBody, listRows, updateRow } from "@/lib/workforce-queries";
import { computeKpis, incentiveFor, monthWindow } from "@/lib/salforce-engine";
import { currency, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/performance")({
  component: PerformancePage,
  head: () => ({
    meta: [
      { title: "KPI, Incentives & Discipline | Salforce AI" },
      {
        name: "description",
        content:
          "Composite KPI scoring, commission and incentive calculation, progressive warnings, performance improvement plans, training and rewards.",
      },
      { property: "og:title", content: "KPI, Incentives & Discipline | Salforce AI" },
      { property: "og:description", content: "Scores, incentives, warnings, PIPs, training and rewards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const ACTION_TYPES = [
  "Reminder",
  "Warning",
  "Final Warning",
  "PIP",
  "Suspension",
  "Termination Recommendation",
  "Appreciation",
  "Promotion",
  "Reward",
];

function PerformancePage() {
  const qc = useQueryClient();
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const canManage = Boolean(access?.isSuperAdmin || access?.isCompanyAdmin);

  const { data: members = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const { data: targets = [] } = useQuery({
    queryKey: ["sales-targets-raw"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_targets").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: plans = [] } = useQuery({ queryKey: ["journey-plans"], queryFn: () => listRows("journey_plans", "plan_date") });
  const { data: visits = [] } = useQuery({ queryKey: ["visits"], queryFn: () => listRows("visits", "visit_date") });
  const { data: attendance = [] } = useQuery({ queryKey: ["attendance"], queryFn: () => listRows("attendance_records", "work_date") });
  const { data: collections = [] } = useQuery({ queryKey: ["collections"], queryFn: () => listRows("collections") });
  const { data: rules = [] } = useQuery({ queryKey: ["incentive-rules"], queryFn: () => listRows("incentive_rules") });
  const { data: payouts = [] } = useQuery({ queryKey: ["incentive-payouts"], queryFn: () => listRows("incentive_payouts") });
  const { data: actions = [] } = useQuery({ queryKey: ["performance-actions"], queryFn: () => listRows("performance_actions") });
  const { data: trainings = [] } = useQuery({ queryKey: ["trainings"], queryFn: () => listRows("trainings") });
  const { data: assignments = [] } = useQuery({ queryKey: ["training-assignments"], queryFn: () => listRows("training_assignments") });

  const invalidate = () =>
    ["incentive-rules", "incentive-payouts", "performance-actions", "trainings", "training-assignments", "hr-letters"].forEach(
      (k) => qc.invalidateQueries({ queryKey: [k] }),
    );

  const kpis = useMemo(
    () =>
      computeKpis({
        today: new Date(),
        members,
        targets,
        orders,
        attendance,
        plans,
        visits,
        collections,
        trainings: assignments,
        documents: [],
        actions,
      }),
    [members, targets, orders, attendance, plans, visits, collections, assignments, actions],
  );

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.full_name ?? "—";

  /* ---- incentive rules ---- */
  const [rule, setRule] = useState({ name: "", min_achievement_percent: "100", commission_percent: "1", flat_bonus: "0", requires_collection_percent: "80" });
  const addRule = useMutation({
    mutationFn: () =>
      insertRow("incentive_rules", {
        name: rule.name,
        min_achievement_percent: Number(rule.min_achievement_percent || 0),
        commission_percent: Number(rule.commission_percent || 0),
        flat_bonus: Number(rule.flat_bonus || 0),
        requires_collection_percent: Number(rule.requires_collection_percent || 0),
      }),
    onSuccess: () => {
      setRule({ name: "", min_achievement_percent: "100", commission_percent: "1", flat_bonus: "0", requires_collection_percent: "80" });
      invalidate();
      toast.success("Incentive rule saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const calcPayouts = useMutation({
    mutationFn: async () => {
      const { start, end } = monthWindow(new Date());
      const periodStart = start.toISOString().slice(0, 10);
      const periodEnd = end.toISOString().slice(0, 10);
      let created = 0;
      for (const kpi of kpis) {
        const result = incentiveFor(kpi, rules);
        if (!result) continue;
        const existing = payouts.find(
          (p) => p.team_member_id === kpi.memberId && p.period_start === periodStart && p.status !== "Rejected",
        );
        const payload = {
          team_member_id: kpi.memberId,
          rule_id: result.rule.id,
          period_start: periodStart,
          period_end: periodEnd,
          achievement_percent: Number(kpi.achievementPercent.toFixed(2)),
          collection_percent: Number(kpi.collectionPercent.toFixed(2)),
          sales_amount: Math.round(kpi.achieved),
          amount: result.amount,
        };
        if (existing) {
          if (existing.status === "Calculated") await updateRow("incentive_payouts", existing.id, payload);
        } else {
          await insertRow("incentive_payouts", payload);
          created++;
        }
      }
      return created;
    },
    onSuccess: (created) => {
      invalidate();
      toast.success(created ? `${created} payout(s) calculated` : "Payouts refreshed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approvePayout = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      await updateRow("incentive_payouts", id, {
        status,
        approved_by: auth.user?.id ?? null,
        approved_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Payout updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---- discipline & rewards ---- */
  const [action, setAction] = useState({ team_member_id: "", action_type: "Warning", reason: "", corrective_action: "", deadline: "" });
  const issueAction = useMutation({
    mutationFn: async () => {
      if (!action.team_member_id) throw new Error("Select an employee.");
      if (!action.reason) throw new Error("A documented reason is required.");
      const level = ACTION_TYPES.indexOf(action.action_type) + 1;
      const { data: auth } = await supabase.auth.getUser();
      await insertRow("performance_actions", {
        team_member_id: action.team_member_id,
        action_type: action.action_type,
        level: Math.min(5, Math.max(1, level)),
        reason: action.reason,
        corrective_action: action.corrective_action || null,
        deadline: action.deadline || null,
        issued_by: auth.user?.id ?? null,
      });
      const letterMap: Record<string, string> = {
        Warning: "Warning Letter",
        "Final Warning": "Warning Letter",
        Appreciation: "Appreciation Letter",
        Promotion: "Promotion Letter",
      };
      const letter = letterMap[action.action_type];
      if (letter) {
        await insertRow("hr_letters", {
          team_member_id: action.team_member_id,
          letter_type: letter,
          subject: action.action_type,
          body: letterBody(letter, memberName(action.team_member_id), { reason: action.reason }),
        });
      }
    },
    onSuccess: () => {
      setAction({ team_member_id: "", action_type: "Warning", reason: "", corrective_action: "", deadline: "" });
      invalidate();
      toast.success("Action recorded and letter filed where applicable");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setActionStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateRow("performance_actions", id, {
        status,
        acknowledged_at: status === "Acknowledged" ? new Date().toISOString() : null,
        closed_at: status === "Closed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Action updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---- training ---- */
  const [training, setTraining] = useState({ title: "", category: "Product" });
  const addTraining = useMutation({
    mutationFn: () => insertRow("trainings", { title: training.title, category: training.category }),
    onSuccess: () => {
      setTraining({ title: "", category: "Product" });
      invalidate();
      toast.success("Training created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [assign, setAssign] = useState({ training_id: "", team_member_id: "", due_date: "" });
  const addAssignment = useMutation({
    mutationFn: () => {
      if (!assign.training_id || !assign.team_member_id) throw new Error("Pick a training and an employee.");
      return insertRow("training_assignments", {
        training_id: assign.training_id,
        team_member_id: assign.team_member_id,
        due_date: assign.due_date || null,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Training assigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeAssignment = useMutation({
    mutationFn: async ({ id, score }: { id: string; score: number }) => {
      const row = assignments.find((a) => a.id === id);
      await updateRow("training_assignments", id, {
        status: score >= 50 ? "Completed" : "Failed",
        score,
        completed_on: new Date().toISOString().slice(0, 10),
      });
      if (score >= 50 && row) {
        const t = trainings.find((x) => x.id === row.training_id);
        await insertRow("hr_letters", {
          team_member_id: row.team_member_id,
          letter_type: "Training Certificate",
          subject: t?.title ?? "Training",
          body: letterBody("Training Certificate", memberName(row.team_member_id), { reason: t?.title ?? "" }),
        });
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Training result saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openActions = actions.filter((a) => ["Open", "Acknowledged", "In Progress"].includes(a.status));
  const pendingPayout = payouts.filter((p) => p.status === "Calculated").reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Gauge}
        title="KPI, Incentives & Discipline"
        subtitle="Composite scoring, commission calculation, progressive warnings, PIPs, training and rewards."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Scored employees" value={String(kpis.length)} />
        <StatCard label="A-band performers" value={String(kpis.filter((k) => k.band === "A").length)} tone="text-teal" />
        <StatCard label="Open actions" value={String(openActions.length)} tone={openActions.length ? "text-amber-500" : undefined} />
        <StatCard label="Incentive awaiting approval" value={currency(pendingPayout)} />
      </div>

      <Panel title="KPI scorecard" description="Sales 50% · visit compliance 20% · attendance 15% · recovery 15%.">
        {kpis.length === 0 && <EmptyRow>No active employees to score.</EmptyRow>}
        <div className="space-y-2">
          {kpis
            .slice()
            .sort((a, b) => b.score - a.score)
            .map((k) => (
              <div key={k.memberId} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                <span className="font-medium">{k.name}</span>
                <Pill tone={k.band === "A" ? "green" : k.band === "B" ? "blue" : k.band === "C" ? "amber" : "red"}>Band {k.band} · {k.score.toFixed(0)}</Pill>
                <span className="text-xs text-muted-foreground">
                  Target {currency(k.targetValue)} · achieved {currency(k.achieved)} ({k.achievementPercent.toFixed(0)}%)
                </span>
                <span className="text-xs text-muted-foreground">
                  Visits {k.visitCompliance.toFixed(0)}% · attendance {k.attendanceRate.toFixed(0)}% · recovery {k.collectionPercent.toFixed(0)}%
                </span>
              </div>
            ))}
        </div>
      </Panel>

      {canManage && (
        <Panel title="Incentive rules & payouts" description="Highest qualifying slab wins. Recovery gate blocks unpaid sales from earning commission.">
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="r_name">Rule</Label>
              <Input id="r_name" className="bg-panel2" value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} placeholder="100% slab" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r_min">Min achievement %</Label>
              <Input id="r_min" type="number" className="bg-panel2" value={rule.min_achievement_percent} onChange={(e) => setRule({ ...rule, min_achievement_percent: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r_comm">Commission %</Label>
              <Input id="r_comm" type="number" step="0.1" className="bg-panel2" value={rule.commission_percent} onChange={(e) => setRule({ ...rule, commission_percent: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r_bonus">Flat bonus</Label>
              <Input id="r_bonus" type="number" className="bg-panel2" value={rule.flat_bonus} onChange={(e) => setRule({ ...rule, flat_bonus: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r_rec">Min recovery %</Label>
              <Input id="r_rec" type="number" className="bg-panel2" value={rule.requires_collection_percent} onChange={(e) => setRule({ ...rule, requires_collection_percent: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => addRule.mutate()} disabled={!rule.name || addRule.isPending}><Plus className="size-4" /> Save rule</Button>
            <Button variant="secondary" onClick={() => calcPayouts.mutate()} disabled={calcPayouts.isPending || rules.length === 0}>
              <Coins className="size-4" /> Calculate this month
            </Button>
          </div>

          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-xs">
                <span className="font-medium text-sm">{r.name}</span>
                <span className="text-muted-foreground">≥{Number(r.min_achievement_percent)}% achievement · {Number(r.commission_percent)}% commission · bonus {currency(Number(r.flat_bonus))} · recovery ≥{Number(r.requires_collection_percent)}%</span>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            {payouts.length === 0 && <EmptyRow>No payouts calculated yet.</EmptyRow>}
            {payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                <span className="font-medium">{memberName(p.team_member_id)}</span>
                <span className="text-xs text-muted-foreground">{shortDate(p.period_start)} – {shortDate(p.period_end)} · {Number(p.achievement_percent).toFixed(0)}% achieved</span>
                <span className="font-medium">{currency(Number(p.amount))}</span>
                <Pill tone={p.status === "Paid" ? "green" : p.status === "Rejected" ? "red" : "amber"}>{p.status}</Pill>
                {p.status === "Calculated" && (
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => approvePayout.mutate({ id: p.id, status: "Approved" })}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => approvePayout.mutate({ id: p.id, status: "Rejected" })}>Reject</Button>
                  </div>
                )}
                {p.status === "Approved" && (
                  <Button size="sm" className="ml-auto" onClick={() => approvePayout.mutate({ id: p.id, status: "Paid" })}>Mark paid</Button>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {canManage && (
        <Panel title="Warnings, PIP & rewards" description="Every action is documented, deadlined and auto-escalated when breached.">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="pa_member">Employee</Label>
              <select id="pa_member" className={selectClass} value={action.team_member_id} onChange={(e) => setAction({ ...action, team_member_id: e.target.value })}>
                <option value="">Select…</option>
                {members.map((m) => (<option key={m.id} value={m.id}>{m.full_name}</option>))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pa_type">Action</Label>
              <select id="pa_type" className={selectClass} value={action.action_type} onChange={(e) => setAction({ ...action, action_type: e.target.value })}>
                {ACTION_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pa_reason">Reason</Label>
              <Input id="pa_reason" className="bg-panel2" value={action.reason} onChange={(e) => setAction({ ...action, reason: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="pa_fix">Required corrective action</Label>
              <Textarea id="pa_fix" className="bg-panel2" value={action.corrective_action} onChange={(e) => setAction({ ...action, corrective_action: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pa_due">Deadline</Label>
              <Input id="pa_due" type="date" className="bg-panel2" value={action.deadline} onChange={(e) => setAction({ ...action, deadline: e.target.value })} />
            </div>
          </div>
          <Button onClick={() => issueAction.mutate()} disabled={issueAction.isPending}><ShieldAlert className="size-4" /> Issue action</Button>
        </Panel>
      )}

      <div className="space-y-2">
        {actions.length === 0 && <EmptyRow>No performance actions on record.</EmptyRow>}
        {actions.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium">{memberName(a.team_member_id)} · {a.action_type} (L{a.level})</div>
              <div className="text-xs text-muted-foreground">{a.reason}</div>
              {a.corrective_action ? <div className="text-xs text-muted-foreground">Required: {a.corrective_action}</div> : null}
            </div>
            {a.auto_generated ? <Pill tone="blue">System issued</Pill> : null}
            <Pill tone={a.status === "Closed" ? "green" : a.status === "Escalated" ? "red" : "amber"}>{a.status}</Pill>
            {a.deadline ? <span className="text-xs text-muted-foreground">due {shortDate(a.deadline)}</span> : null}
            <div className="ml-auto flex gap-2">
              {a.status === "Open" && (
                <Button size="sm" variant="secondary" onClick={() => setActionStatus.mutate({ id: a.id, status: "Acknowledged" })}>Acknowledge</Button>
              )}
              {canManage && a.status !== "Closed" && (
                <Button size="sm" onClick={() => setActionStatus.mutate({ id: a.id, status: "Closed" })}>Close</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Panel title="Training & certification">
        {canManage && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="tr_title">Training</Label>
                <Input id="tr_title" className="bg-panel2" value={training.title} onChange={(e) => setTraining({ ...training, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tr_cat">Category</Label>
                <select id="tr_cat" className={selectClass} value={training.category} onChange={(e) => setTraining({ ...training, category: e.target.value })}>
                  {["Product", "Selling Skills", "Compliance", "Systems"].map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div className="flex items-end">
                <Button onClick={() => addTraining.mutate()} disabled={!training.title || addTraining.isPending}><GraduationCap className="size-4" /> Create</Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4 border-t border-line pt-4">
              <div className="space-y-2">
                <Label htmlFor="as_training">Training</Label>
                <select id="as_training" className={selectClass} value={assign.training_id} onChange={(e) => setAssign({ ...assign, training_id: e.target.value })}>
                  <option value="">Select…</option>
                  {trainings.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="as_member">Employee</Label>
                <select id="as_member" className={selectClass} value={assign.team_member_id} onChange={(e) => setAssign({ ...assign, team_member_id: e.target.value })}>
                  <option value="">Select…</option>
                  {members.map((m) => (<option key={m.id} value={m.id}>{m.full_name}</option>))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="as_due">Due date</Label>
                <Input id="as_due" type="date" className="bg-panel2" value={assign.due_date} onChange={(e) => setAssign({ ...assign, due_date: e.target.value })} />
              </div>
              <div className="flex items-end">
                <Button onClick={() => addAssignment.mutate()} disabled={addAssignment.isPending}><Plus className="size-4" /> Assign</Button>
              </div>
            </div>
          </>
        )}
        <div className="space-y-2">
          {assignments.length === 0 && <EmptyRow>No training assigned.</EmptyRow>}
          {assignments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
              <span className="font-medium">{trainings.find((t) => t.id === a.training_id)?.title ?? "Training"}</span>
              <span className="text-xs text-muted-foreground">{memberName(a.team_member_id)} · due {a.due_date ? shortDate(a.due_date) : "—"}</span>
              <Pill tone={a.status === "Completed" ? "green" : a.status === "Failed" ? "red" : "amber"}>{a.status}</Pill>
              {a.status !== "Completed" && a.status !== "Failed" && (
                <ScoreEntry onSubmit={(score) => completeAssignment.mutate({ id: a.id, score })} />
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ScoreEntry({ onSubmit }: { onSubmit: (score: number) => void }) {
  const [score, setScore] = useState("");
  return (
    <div className="ml-auto flex items-center gap-2">
      <Input
        type="number"
        min="0"
        max="100"
        className="bg-panel h-9 w-24"
        placeholder="Score"
        aria-label="Training score"
        value={score}
        onChange={(e) => setScore(e.target.value)}
      />
      <Button size="sm" disabled={!score} onClick={() => onSubmit(Number(score))}>Save result</Button>
    </div>
  );
}
