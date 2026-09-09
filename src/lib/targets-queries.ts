import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Order, Customer } from "@/lib/crm-queries";

export type SalesTarget = Tables<"sales_targets">;
export type RecoveryPlan = Tables<"target_recovery_plans">;

export type TargetMetric = "sales_amount" | "orders" | "new_customers";

export const TARGET_METRICS: { key: TargetMetric; label: string; unit: "currency" | "count" }[] = [
  { key: "sales_amount", label: "Sales value", unit: "currency" },
  { key: "orders", label: "Orders booked", unit: "count" },
  { key: "new_customers", label: "New customers", unit: "count" },
];

export type TargetWithMember = SalesTarget & {
  team_members: Pick<Tables<"team_members">, "id" | "full_name" | "role_title"> | null;
};

export async function fetchTargets(): Promise<TargetWithMember[]> {
  const { data, error } = await supabase
    .from("sales_targets")
    .select("*, team_members(id, full_name, role_title)")
    .order("period_start", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TargetWithMember[];
}

export type TargetInput = {
  team_member_id: string | null;
  metric: TargetMetric;
  period_start: string;
  period_end: string;
  target_value: number;
  notes: string | null;
};

export async function createTarget(input: TargetInput) {
  const { error } = await supabase.from("sales_targets").insert(input);
  if (error) throw error;
}

export async function updateTarget(id: string, patch: Partial<TargetInput>) {
  const { error } = await supabase.from("sales_targets").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTarget(id: string) {
  const { error } = await supabase.from("sales_targets").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchRecoveryPlans(): Promise<RecoveryPlan[]> {
  const { data, error } = await supabase
    .from("target_recovery_plans")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createRecoveryPlan(input: {
  target_id: string;
  team_member_id: string | null;
  risk_level: RiskLevel;
  gap_percent: number;
  action: string;
  commitment: string | null;
  deadline: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("target_recovery_plans")
    .insert({ ...input, created_by: auth.user?.id ?? null });
  if (error) throw error;
}

export async function setRecoveryPlanStatus(id: string, status: "Open" | "Achieved" | "Missed" | "Closed") {
  const { error } = await supabase
    .from("target_recovery_plans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Performance maths — pure, so dashboard numbers reconcile with rows   */
/* ------------------------------------------------------------------ */

export type RiskLevel = "green" | "blue" | "yellow" | "orange" | "red";

export const RISK_LABEL: Record<RiskLevel, string> = {
  green: "On track",
  blue: "Early advisory",
  yellow: "Attention required",
  orange: "Performance risk",
  red: "Critical",
};

export const RISK_CLASS: Record<RiskLevel, string> = {
  green: "border-teal/40 bg-teal/10 text-teal",
  blue: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  yellow: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  red: "border-red-500/50 bg-red-500/10 text-red-400",
};

/** Working days exclude Sundays. Both ends inclusive. */
export function workingDays(from: Date, to: Date) {
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= end) {
    if (cursor.getDay() !== 0) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export type Performance = {
  target: number;
  achieved: number;
  achievementPct: number;
  remaining: number;
  workingDaysTotal: number;
  workingDaysElapsed: number;
  workingDaysLeft: number;
  expectedPct: number;
  expectedValue: number;
  requiredDailyPace: number;
  projected: number;
  gapPct: number;
  risk: RiskLevel;
};

export function computePerformance(
  target: number,
  achieved: number,
  periodStart: string,
  periodEnd: string,
  today = new Date(),
): Performance {
  const start = new Date(`${periodStart}T00:00:00`);
  const end = new Date(`${periodEnd}T00:00:00`);
  const now = today < start ? start : today > end ? end : today;

  const total = Math.max(1, workingDays(start, end));
  const elapsed = Math.min(total, Math.max(0, workingDays(start, now)));
  const left = Math.max(0, total - elapsed);

  const achievementPct = target > 0 ? (achieved / target) * 100 : 0;
  const expectedPct = (elapsed / total) * 100;
  const expectedValue = (target * elapsed) / total;
  const remaining = Math.max(0, target - achieved);
  const requiredDailyPace = left > 0 ? remaining / left : remaining;
  const projected = elapsed > 0 ? (achieved / elapsed) * total : 0;
  const gapPct = expectedPct - achievementPct;

  const risk: RiskLevel =
    gapPct <= 0 ? "green" : gapPct <= 5 ? "blue" : gapPct <= 12 ? "yellow" : gapPct <= 25 ? "orange" : "red";

  return {
    target,
    achieved,
    achievementPct,
    remaining,
    workingDaysTotal: total,
    workingDaysElapsed: elapsed,
    workingDaysLeft: left,
    expectedPct,
    expectedValue,
    requiredDailyPace,
    projected,
    gapPct,
    risk,
  };
}

function inPeriod(iso: string, periodStart: string, periodEnd: string) {
  const t = new Date(iso).getTime();
  return t >= new Date(`${periodStart}T00:00:00`).getTime() && t <= new Date(`${periodEnd}T23:59:59`).getTime();
}

/** Achievement is derived from the same order/customer rows the CRM lists elsewhere. */
export function achievementFor(
  target: Pick<SalesTarget, "metric" | "team_member_id" | "period_start" | "period_end">,
  orders: Order[],
  customers: Customer[],
) {
  const member = target.team_member_id;
  if (target.metric === "new_customers") {
    return customers.filter(
      (c) =>
        inPeriod(c.created_at, target.period_start, target.period_end) &&
        (!member || c.assigned_to === member),
    ).length;
  }
  const rows = orders.filter(
    (o) =>
      inPeriod(o.created_at, target.period_start, target.period_end) &&
      (!member || o.assigned_to === member) &&
      o.order_status !== "Cancelled" &&
      o.order_status !== "Returned" &&
      o.payment_status !== "Refunded",
  );
  if (target.metric === "orders") return rows.length;
  return rows.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
}

export const RECOVERY_ACTIONS = [
  "Increase customer visits",
  "Focus on high-potential outlets",
  "Follow up pending quotations",
  "Recover overdue payments",
  "Push selected products",
  "Request manager assistance",
  "Request target review",
] as const;

export function currentMonthPeriod(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}
