import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { listRows, myCompanyId, startOfToday } from "@/lib/workforce-queries";

/**
 * System-as-Boss control layer.
 *
 * `evaluateWorkforce` is pure so the numbers can be unit-tested and reconciled
 * with the rows on screen. `runSalforceEngine` persists the outcome as
 * de-duplicated alerts plus a progressive disciplinary ladder.
 */

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertDraft = {
  team_member_id: string;
  category: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  source_key: string;
  due_date: string | null;
};

export type EngineInput = {
  today: Date;
  members: Pick<Tables<"team_members">, "id" | "full_name" | "is_active">[];
  targets: Tables<"sales_targets">[];
  orders: Pick<Tables<"orders">, "id" | "assigned_to" | "total_amount" | "order_status" | "created_at">[];
  attendance: Tables<"attendance_records">[];
  plans: Tables<"journey_plans">[];
  visits: Tables<"visits">[];
  collections: Tables<"collections">[];
  trainings: Tables<"training_assignments">[];
  documents: Tables<"employee_documents">[];
  actions: Tables<"performance_actions">[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const EXCLUDED_ORDER_STATUS = ["Cancelled", "Returned"];

export function monthWindow(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start, end };
}

/** Sundays are non-working. Both ends inclusive. */
export function workingDaysBetween(from: Date, to: Date) {
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (cursor <= to) {
    if (cursor.getDay() !== 0) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function salesAchieved(
  orders: EngineInput["orders"],
  memberId: string | null,
  start: Date,
  end: Date,
) {
  return orders
    .filter((o) => !EXCLUDED_ORDER_STATUS.includes(o.order_status))
    .filter((o) => (memberId ? o.assigned_to === memberId : true))
    .filter((o) => {
      const at = new Date(o.created_at);
      return at >= start && at <= new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
    })
    .reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
}

export function paceRisk(achievedPercent: number, elapsedPercent: number): AlertSeverity | null {
  const gap = elapsedPercent - achievedPercent;
  if (gap >= 30) return "critical";
  if (gap >= 15) return "warning";
  if (gap >= 8) return "info";
  return null;
}

export function evaluateWorkforce(input: EngineInput): AlertDraft[] {
  const { today } = input;
  const { start, end } = monthWindow(today);
  const elapsed = workingDaysBetween(start, today);
  const total = workingDaysBetween(start, end);
  const elapsedPercent = total ? (elapsed / total) * 100 : 0;
  const drafts: AlertDraft[] = [];
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const todayKey = iso(today);

  const active = input.members.filter((m) => m.is_active);

  for (const member of active) {
    /* 1. Target pace ------------------------------------------------ */
    const target = input.targets.find(
      (t) =>
        t.team_member_id === member.id &&
        t.metric === "sales_amount" &&
        new Date(t.period_start) <= today &&
        new Date(t.period_end) >= today,
    );
    if (target && Number(target.target_value) > 0) {
      const achieved = salesAchieved(input.orders, member.id, new Date(target.period_start), new Date(target.period_end));
      const percent = (achieved / Number(target.target_value)) * 100;
      const severity = paceRisk(percent, elapsedPercent);
      if (severity) {
        drafts.push({
          team_member_id: member.id,
          category: "target_pace",
          severity,
          title: `${member.full_name}: behind target pace`,
          detail: `${percent.toFixed(0)}% achieved against ${elapsedPercent.toFixed(0)}% of the period elapsed. Remaining Rs ${Math.max(0, Number(target.target_value) - achieved).toLocaleString()}.`,
          source_key: `target_pace:${member.id}:${monthKey}`,
          due_date: target.period_end,
        });
      }
    } else {
      drafts.push({
        team_member_id: member.id,
        category: "target_missing",
        severity: "warning",
        title: `${member.full_name}: no active sales target`,
        detail: "Assign a monthly sales target so the system can measure and control performance.",
        source_key: `target_missing:${member.id}:${monthKey}`,
        due_date: iso(end),
      });
    }

    /* 2. Attendance -------------------------------------------------- */
    const absent = input.attendance.filter(
      (a) =>
        a.team_member_id === member.id &&
        a.status === "Absent" &&
        new Date(a.work_date) >= start &&
        new Date(a.work_date) <= today,
    ).length;
    if (absent >= 2) {
      drafts.push({
        team_member_id: member.id,
        category: "attendance",
        severity: absent >= 4 ? "critical" : "warning",
        title: `${member.full_name}: ${absent} absences this month`,
        detail: "Attendance below policy. A written explanation is required from the employee.",
        source_key: `attendance:${member.id}:${monthKey}`,
        due_date: todayKey,
      });
    }

    /* 3. Journey plan discipline ------------------------------------- */
    const todayPlan = input.plans.find((p) => p.team_member_id === member.id && p.plan_date === todayKey);
    if (today.getDay() !== 0 && !todayPlan) {
      drafts.push({
        team_member_id: member.id,
        category: "journey_plan",
        severity: "warning",
        title: `${member.full_name}: no journey plan for today`,
        detail: "Field staff must file a journey plan before starting the day.",
        source_key: `journey_plan:${member.id}:${todayKey}`,
        due_date: todayKey,
      });
    } else if (todayPlan) {
      const done = input.visits.filter(
        (v) => v.team_member_id === member.id && v.visit_date === todayKey && v.outcome !== "Pending",
      ).length;
      if (todayPlan.planned_visits > 0 && done < todayPlan.planned_visits) {
        const coverage = (done / todayPlan.planned_visits) * 100;
        drafts.push({
          team_member_id: member.id,
          category: "visit_coverage",
          severity: coverage < 50 ? "warning" : "info",
          title: `${member.full_name}: ${done}/${todayPlan.planned_visits} planned visits closed`,
          detail: "Close the remaining visits with an outcome before day end.",
          source_key: `visit_coverage:${member.id}:${todayKey}`,
          due_date: todayKey,
        });
      }
    }

    /* 4. Recovery / collections -------------------------------------- */
    const overdue = input.collections.filter(
      (c) =>
        c.team_member_id === member.id &&
        c.status !== "Cleared" &&
        c.status !== "Written Off" &&
        c.due_date != null &&
        new Date(c.due_date) < startOfToday(),
    );
    if (overdue.length) {
      const amount = overdue.reduce(
        (s, c) => s + (Number(c.amount_due ?? 0) - Number(c.amount_collected ?? 0)),
        0,
      );
      drafts.push({
        team_member_id: member.id,
        category: "collections",
        severity: amount >= 100000 || overdue.length >= 5 ? "critical" : "warning",
        title: `${member.full_name}: Rs ${amount.toLocaleString()} overdue recovery`,
        detail: `${overdue.length} overdue invoice(s). Recovery commitment with dates is required.`,
        source_key: `collections:${member.id}:${monthKey}`,
        due_date: todayKey,
      });
    }

    /* 5. Training ----------------------------------------------------- */
    const lateTraining = input.trainings.filter(
      (t) =>
        t.team_member_id === member.id &&
        t.status !== "Completed" &&
        t.due_date != null &&
        new Date(t.due_date) < startOfToday(),
    ).length;
    if (lateTraining) {
      drafts.push({
        team_member_id: member.id,
        category: "training",
        severity: "warning",
        title: `${member.full_name}: ${lateTraining} overdue training(s)`,
        detail: "Mandatory training must be completed by the due date.",
        source_key: `training:${member.id}:${monthKey}`,
        due_date: todayKey,
      });
    }

    /* 6. Employee file completeness ----------------------------------- */
    const pendingDocs = input.documents.filter(
      (d) => d.team_member_id === member.id && d.status === "Pending",
    );
    if (pendingDocs.length) {
      drafts.push({
        team_member_id: member.id,
        category: "documents",
        severity: pendingDocs.some((d) => d.doc_type === "Security Cheque") ? "warning" : "info",
        title: `${member.full_name}: ${pendingDocs.length} document(s) pending`,
        detail: pendingDocs.map((d) => d.doc_type).join(", "),
        source_key: `documents:${member.id}`,
        due_date: null,
      });
    }

    /* 7. Corrective action deadlines ---------------------------------- */
    const breached = input.actions.filter(
      (a) =>
        a.team_member_id === member.id &&
        ["Open", "Acknowledged", "In Progress"].includes(a.status) &&
        a.deadline != null &&
        new Date(a.deadline) < startOfToday(),
    );
    for (const action of breached) {
      drafts.push({
        team_member_id: member.id,
        category: "action_overdue",
        severity: "critical",
        title: `${member.full_name}: ${action.action_type} deadline breached`,
        detail: `${action.reason} — corrective action was due ${action.deadline}. Escalation required.`,
        source_key: `action_overdue:${action.id}`,
        due_date: action.deadline,
      });
    }
  }

  return drafts;
}

/* ------------------------------------------------------------------ */
/* Progressive discipline ladder                                       */
/* ------------------------------------------------------------------ */

const LADDER = [
  { level: 1, type: "Reminder" },
  { level: 2, type: "Warning" },
  { level: 3, type: "Final Warning" },
  { level: 4, type: "PIP" },
  { level: 5, type: "Termination Recommendation" },
] as const;

export function nextLadderStep(previousCount: number) {
  return LADDER[Math.min(previousCount, LADDER.length - 1)] ?? LADDER[0];
}

export type EngineResult = {
  alertsRaised: number;
  alertsResolved: number;
  actionsIssued: number;
};

/** Runs the whole control layer for the signed-in company. Idempotent. */
export async function runSalforceEngine(): Promise<EngineResult> {
  const companyId = await myCompanyId();
  if (!companyId) return { alertsRaised: 0, alertsResolved: 0, actionsIssued: 0 };

  const [membersRes, targetsRes, ordersRes] = await Promise.all([
    supabase.from("team_members").select("id, full_name, is_active"),
    supabase.from("sales_targets").select("*"),
    supabase.from("orders").select("id, assigned_to, total_amount, order_status, created_at"),
  ]);

  const [attendance, plans, visits, collections, trainings, documents, actions, existingAlerts] =
    await Promise.all([
      listRows("attendance_records", "work_date"),
      listRows("journey_plans", "plan_date"),
      listRows("visits", "visit_date"),
      listRows("collections"),
      listRows("training_assignments"),
      listRows("employee_documents"),
      listRows("performance_actions"),
      listRows("system_alerts"),
    ]);

  const drafts = evaluateWorkforce({
    today: new Date(),
    members: membersRes.data ?? [],
    targets: targetsRes.data ?? [],
    orders: ordersRes.data ?? [],
    attendance,
    plans,
    visits,
    collections,
    trainings,
    documents,
    actions,
  });

  const draftKeys = new Set(drafts.map((d) => d.source_key));

  /* Raise / refresh alerts (unique on company_id + source_key). */
  if (drafts.length) {
    const { error } = await supabase.from("system_alerts").upsert(
      drafts.map((d) => ({ ...d, company_id: companyId, status: "Open", resolved_at: null })),
      { onConflict: "company_id,source_key" },
    );
    if (error) throw error;
  }

  /* Auto-resolve alerts whose condition no longer holds. */
  const stale = existingAlerts.filter((a) => a.status !== "Resolved" && !draftKeys.has(a.source_key));
  if (stale.length) {
    await supabase
      .from("system_alerts")
      .update({ status: "Resolved", resolved_at: new Date().toISOString() })
      .in(
        "id",
        stale.map((a) => a.id),
      );
  }

  /* Escalate critical findings into the disciplinary ladder. */
  let actionsIssued = 0;
  const { data: auth } = await supabase.auth.getUser();
  for (const draft of drafts.filter((d) => d.severity === "critical")) {
    const sourceKey = `auto:${draft.source_key}`;
    if (actions.some((a) => a.source_key === sourceKey)) continue;
    const previous = actions.filter(
      (a) => a.team_member_id === draft.team_member_id && a.auto_generated && a.status !== "Cancelled",
    ).length;
    const step = nextLadderStep(previous);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    const { error } = await supabase.from("performance_actions").insert({
      company_id: companyId,
      team_member_id: draft.team_member_id,
      action_type: step.type,
      level: step.level,
      reason: draft.title,
      corrective_action: draft.detail,
      deadline: iso(deadline),
      auto_generated: true,
      source_key: sourceKey,
      issued_by: auth.user?.id ?? null,
    });
    if (!error) actionsIssued++;
  }

  return { alertsRaised: drafts.length, alertsResolved: stale.length, actionsIssued };
}

/* ------------------------------------------------------------------ */
/* KPI scoring                                                         */
/* ------------------------------------------------------------------ */

export type Kpi = {
  memberId: string;
  name: string;
  targetValue: number;
  achieved: number;
  achievementPercent: number;
  visitCompliance: number;
  attendanceRate: number;
  collectionPercent: number;
  score: number;
  band: "A" | "B" | "C" | "D";
};

export function computeKpis(input: EngineInput): Kpi[] {
  const { start, end } = monthWindow(input.today);
  return input.members
    .filter((m) => m.is_active)
    .map((m) => {
      const target = input.targets.find(
        (t) => t.team_member_id === m.id && t.metric === "sales_amount" && new Date(t.period_end) >= start,
      );
      const targetValue = Number(target?.target_value ?? 0);
      const achieved = salesAchieved(input.orders, m.id, start, end);
      const achievementPercent = targetValue ? (achieved / targetValue) * 100 : 0;

      const planned = input.plans
        .filter((p) => p.team_member_id === m.id && new Date(p.plan_date) >= start)
        .reduce((s, p) => s + p.planned_visits, 0);
      const done = input.visits.filter(
        (v) => v.team_member_id === m.id && new Date(v.visit_date) >= start && v.outcome !== "Pending",
      ).length;
      const visitCompliance = planned ? Math.min(100, (done / planned) * 100) : 0;

      const days = input.attendance.filter((a) => a.team_member_id === m.id && new Date(a.work_date) >= start);
      const present = days.filter((a) => ["Present", "Late", "Half Day"].includes(a.status)).length;
      const attendanceRate = days.length ? (present / days.length) * 100 : 0;

      const mine = input.collections.filter((c) => c.team_member_id === m.id);
      const due = mine.reduce((s, c) => s + Number(c.amount_due ?? 0), 0);
      const got = mine.reduce((s, c) => s + Number(c.amount_collected ?? 0), 0);
      const collectionPercent = due ? (got / due) * 100 : 0;

      const score =
        Math.min(100, achievementPercent) * 0.5 +
        visitCompliance * 0.2 +
        attendanceRate * 0.15 +
        Math.min(100, collectionPercent) * 0.15;

      const band: Kpi["band"] = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";

      return {
        memberId: m.id,
        name: m.full_name,
        targetValue,
        achieved,
        achievementPercent,
        visitCompliance,
        attendanceRate,
        collectionPercent,
        score,
        band,
      };
    });
}

/* ------------------------------------------------------------------ */
/* Incentives                                                          */
/* ------------------------------------------------------------------ */

export function incentiveFor(
  kpi: Kpi,
  rules: Tables<"incentive_rules">[],
): { rule: Tables<"incentive_rules">; amount: number } | null {
  const eligible = rules
    .filter((r) => r.is_active)
    .filter((r) => kpi.achievementPercent >= Number(r.min_achievement_percent))
    .filter((r) => kpi.collectionPercent >= Number(r.requires_collection_percent))
    .sort((a, b) => Number(b.min_achievement_percent) - Number(a.min_achievement_percent))[0];
  if (!eligible) return null;
  const amount =
    (kpi.achieved * Number(eligible.commission_percent)) / 100 + Number(eligible.flat_bonus);
  return { rule: eligible, amount: Math.round(amount) };
}
