import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/**
 * Salforce AI workforce data access.
 * Every table below is tenant scoped by RLS + the set_crm_company_id trigger,
 * so the client never sends company_id explicitly.
 */
export type WorkforceTable =
  | "job_openings"
  | "job_applications"
  | "employee_records"
  | "employee_documents"
  | "territories"
  | "customer_allocations"
  | "journey_plans"
  | "visits"
  | "attendance_records"
  | "collections"
  | "competitor_intel"
  | "incentive_rules"
  | "incentive_payouts"
  | "performance_actions"
  | "trainings"
  | "training_assignments"
  | "hr_letters"
  | "system_alerts"
  | "workforce_audit_logs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = (table: WorkforceTable) => supabase.from(table as any) as any;

export async function listRows<T extends WorkforceTable>(
  table: T,
  orderColumn = "created_at",
  ascending = false,
): Promise<Tables<T>[]> {
  const { data, error } = await db(table).select("*").order(orderColumn, { ascending });
  if (error) throw error;
  return (data ?? []) as Tables<T>[];
}

export async function insertRow<T extends WorkforceTable>(
  table: T,
  values: TablesInsert<T>,
): Promise<Tables<T>> {
  const { data, error } = await db(table).insert(values).select("*").single();
  if (error) throw error;
  await audit(table, (data as { id?: string })?.id ?? null, "create", values as object);
  return data as Tables<T>;
}

export async function updateRow<T extends WorkforceTable>(
  table: T,
  id: string,
  patch: TablesUpdate<T>,
): Promise<void> {
  const { error } = await db(table).update(patch).eq("id", id);
  if (error) throw error;
  await audit(table, id, "update", patch as object);
}

export async function deleteRow(table: WorkforceTable, id: string): Promise<void> {
  const { error } = await db(table).delete().eq("id", id);
  if (error) throw error;
  await audit(table, id, "delete", {});
}

/** Append-only history. Never blocks the caller if logging itself fails. */
export async function audit(entity: string, entityId: string | null, action: string, details: object) {
  if (entity === "workforce_audit_logs") return;
  try {
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from("workforce_audit_logs").insert({
      actor_id: auth.user?.id ?? null,
      entity,
      entity_id: entityId,
      action,
      details: details as never,
    });
  } catch {
    /* history is best-effort */
  }
}

export async function myCompanyId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  return data?.company_id ?? null;
}

/* ------------------------------------------------------------------ */
/* Recruitment                                                         */
/* ------------------------------------------------------------------ */

export const APPLICATION_STAGES = [
  "Applied",
  "Screening",
  "Interview",
  "Test",
  "Selected",
  "Approved",
  "Onboarding",
  "Hired",
  "Rejected",
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/** Forward-only funnel. Rejection is allowed from any live stage. */
export function nextStages(stage: string): ApplicationStage[] {
  if (stage === "Hired" || stage === "Rejected") return [];
  const idx = APPLICATION_STAGES.indexOf(stage as ApplicationStage);
  const forward = APPLICATION_STAGES[idx + 1];
  const options: ApplicationStage[] = [];
  if (forward && forward !== "Rejected") options.push(forward);
  options.push("Rejected");
  return options;
}

export function stageBlocked(app: Tables<"job_applications">, target: ApplicationStage): string | null {
  if (target === "Interview" && app.screening_score == null) return "Record a screening score first.";
  if (target === "Test" && app.interview_score == null) return "Record an interview score first.";
  if (target === "Selected" && app.test_score == null) return "Record a test score first.";
  if (target === "Approved" && (Number(app.test_score ?? 0) < 50 || Number(app.interview_score ?? 0) < 50))
    return "Interview and test scores must both be at least 50 to approve.";
  return null;
}

/** Approved candidate -> real employee: team member + employee record + onboarding checklist. */
export async function hireApplicant(app: Tables<"job_applications">, joiningDate: string, salary: number) {
  if (app.stage === "Hired" || app.hired_team_member_id) {
    throw new Error("This applicant already has an employee file.");
  }
  if (app.stage !== "Onboarding") {
    throw new Error("Applicant must reach the Onboarding stage before an employee file is created.");
  }
  if (!joiningDate) throw new Error("Set a joining date first.");
  if (!salary || salary <= 0) throw new Error("Set a monthly salary first.");

  const { data: member, error: memberError } = await supabase

    .from("team_members")
    .insert({
      full_name: app.full_name,
      email: app.email,
      phone: app.phone,
      role_title: "Sales Officer",
      is_active: true,
    })
    .select("id")
    .single();
  if (memberError) throw memberError;

  // Claim the application immediately so a retry can never create a second employee file.
  await updateRow("job_applications", app.id, {
    stage: "Hired",
    hired_team_member_id: member.id,
    updated_at: new Date().toISOString(),
  });

  await insertRow("employee_records", {

    team_member_id: member.id,
    designation: "Sales Officer",
    territory: app.city,
    joining_date: joiningDate,
    base_salary: salary,
    employment_status: "Probation",
  });

  const required = ["CNIC", "Employment Agreement", "Security Cheque"] as const;
  for (const doc of required) {
    await insertRow("employee_documents", { team_member_id: member.id, doc_type: doc, status: "Pending" });
  }

  await insertRow("hr_letters", {
    team_member_id: member.id,
    letter_type: "Appointment Letter",
    subject: `Appointment as Sales Officer`,
    body: letterBody("Appointment Letter", app.full_name, {
      joiningDate,
      salary,
    }),
  });



  return member.id;
}

/* ------------------------------------------------------------------ */
/* Letters                                                             */
/* ------------------------------------------------------------------ */

export function letterBody(
  type: string,
  name: string,
  ctx: { joiningDate?: string; salary?: number; reason?: string; effective?: string } = {},
) {
  const date = new Date().toLocaleDateString("en-GB");
  switch (type) {
    case "Appointment Letter":
      return `Dear ${name},\n\nWe are pleased to confirm your appointment as Sales Officer effective ${ctx.joiningDate ?? date}. Your monthly gross salary is Rs ${(ctx.salary ?? 0).toLocaleString()}. You will serve a probation period of three months during which your performance against assigned targets, journey plans and recovery responsibilities will be reviewed.\n\nRegards,\nHuman Resources`;
    case "Confirmation Letter":
      return `Dear ${name},\n\nFollowing a satisfactory probation review, we are pleased to confirm your employment with effect from ${ctx.effective ?? date}.\n\nRegards,\nHuman Resources`;
    case "Warning Letter":
      return `Dear ${name},\n\nThis letter serves as a formal warning regarding: ${ctx.reason ?? "performance shortfall"}. You are required to submit a corrective action plan and demonstrate measurable improvement within the stated deadline. Failure to improve may lead to further disciplinary action.\n\nRegards,\nHuman Resources`;
    case "Appreciation Letter":
      return `Dear ${name},\n\nIn recognition of your outstanding performance (${ctx.reason ?? "target achievement"}), the management would like to place on record its appreciation of your contribution.\n\nRegards,\nHuman Resources`;
    case "Promotion Letter":
      return `Dear ${name},\n\nWe are pleased to inform you of your promotion effective ${ctx.effective ?? date}, in recognition of sustained performance.\n\nRegards,\nHuman Resources`;
    case "Experience Certificate":
      return `TO WHOM IT MAY CONCERN\n\nThis is to certify that ${name} served this organisation and was found to be diligent and professional. This certificate is issued on request on ${date}.\n\nHuman Resources`;
    case "Training Certificate":
      return `TO WHOM IT MAY CONCERN\n\nThis is to certify that ${name} has successfully completed the training programme ${ctx.reason ?? ""}. Issued on ${date}.\n\nLearning & Development`;
    case "Relieving Letter":
      return `Dear ${name},\n\nYour separation from the organisation is effective ${ctx.effective ?? date}. All company assets and dues have been processed as per the exit clearance record.\n\nRegards,\nHuman Resources`;
    case "Proforma Invoice":
      return `PROFORMA INVOICE\n\nPrepared by: ${name}\nDate: ${date}\n\nThis proforma is issued for customer confirmation and does not constitute a tax invoice.`;
    default:
      return `Dear ${name},\n\n${ctx.reason ?? ""}\n\nRegards,\nHuman Resources`;
  }
}

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export function collectionStatus(row: {
  amount_due: number;
  amount_collected: number;
  due_date: string | null;
}): Tables<"collections">["status"] {
  const due = Number(row.amount_due ?? 0);
  const got = Number(row.amount_collected ?? 0);
  if (got >= due && due > 0) return "Cleared";
  const overdue = row.due_date ? new Date(row.due_date) < startOfToday() : false;
  if (overdue) return "Overdue";
  if (got > 0) return "Partial";
  return "Outstanding";
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function recordCollectionPayment(row: Tables<"collections">, amount: number) {
  if (amount <= 0) throw new Error("Payment amount must be greater than zero.");
  const collected = Number(row.amount_collected ?? 0) + amount;
  if (collected > Number(row.amount_due ?? 0)) throw new Error("Payment exceeds the outstanding amount.");
  const next = {
    amount_collected: collected,
    collected_on: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  };
  await updateRow("collections", row.id, {
    ...next,
    status: collectionStatus({ ...row, amount_collected: collected }),
  });
}
