import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IdCard, FileText, Plus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyRow, PageHeader, Panel, Pill, StatCard, selectClass } from "@/components/crm/WorkforceUI";
import { fetchMyAccess, fetchTeamMembers } from "@/lib/comms-queries";
import { insertRow, letterBody, listRows, updateRow } from "@/lib/workforce-queries";
import { currency, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/workforce")({
  component: WorkforcePage,
  head: () => ({
    meta: [
      { title: "Employee Files & Documents | Salforce AI" },
      {
        name: "description",
        content:
          "Employee records, security cheques, agreements, confirmation, promotions, letters, certificates and exit clearance in one controlled file.",
      },
      { property: "og:title", content: "Employee Files & Documents | Salforce AI" },
      { property: "og:description", content: "Employee lifecycle records, documents, letters and exits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const DOC_TYPES = [
  "CNIC",
  "Education",
  "Experience Letter",
  "Employment Agreement",
  "Security Cheque",
  "Guarantee",
  "Bank Details",
  "Other",
];

const LETTER_TYPES = [
  "Offer Letter",
  "Appointment Letter",
  "Confirmation Letter",
  "Warning Letter",
  "Appreciation Letter",
  "Promotion Letter",
  "Experience Certificate",
  "Training Certificate",
  "Relieving Letter",
  "Proforma Invoice",
];

function WorkforcePage() {
  const qc = useQueryClient();
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const canManage = Boolean(access?.isSuperAdmin || access?.isCompanyAdmin);

  const { data: members = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });
  const { data: records = [] } = useQuery({ queryKey: ["employee-records"], queryFn: () => listRows("employee_records") });
  const { data: docs = [] } = useQuery({ queryKey: ["employee-documents"], queryFn: () => listRows("employee_documents") });
  const { data: letters = [] } = useQuery({ queryKey: ["hr-letters"], queryFn: () => listRows("hr_letters") });

  const invalidate = () => {
    ["employee-records", "employee-documents", "hr-letters", "team-members"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };

  const [selected, setSelected] = useState<string>("");
  const memberId = selected || members[0]?.id || "";
  const member = members.find((m) => m.id === memberId);
  const record = records.find((r) => r.team_member_id === memberId);
  const memberDocs = docs.filter((d) => d.team_member_id === memberId);
  const memberLetters = letters.filter((l) => l.team_member_id === memberId);

  const pendingSecurity = useMemo(
    () => docs.filter((d) => d.doc_type === "Security Cheque" && d.status === "Pending").length,
    [docs],
  );

  /* -------- employee record -------- */
  const [form, setForm] = useState({ designation: "", territory: "", joining_date: "", base_salary: "" });
  const saveRecord = useMutation({
    mutationFn: async () => {
      const payload = {
        designation: form.designation || record?.designation || null,
        territory: form.territory || record?.territory || null,
        joining_date: form.joining_date || record?.joining_date || null,
        base_salary: Number(form.base_salary || record?.base_salary || 0),
        updated_at: new Date().toISOString(),
      };
      if (record) await updateRow("employee_records", record.id, payload);
      else await insertRow("employee_records", { team_member_id: memberId, ...payload });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Employee file saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!record) throw new Error("Create the employee file first.");
      if (status === "Confirmed" && memberDocs.some((d) => d.status === "Pending"))
        throw new Error("All onboarding documents must be received before confirmation.");
      await updateRow("employee_records", record.id, {
        employment_status: status,
        confirmation_date: status === "Confirmed" ? new Date().toISOString().slice(0, 10) : record.confirmation_date,
        updated_at: new Date().toISOString(),
      });
      if (status === "Confirmed" && member) {
        await insertRow("hr_letters", {
          team_member_id: memberId,
          letter_type: "Confirmation Letter",
          subject: "Confirmation of employment",
          body: letterBody("Confirmation Letter", member.full_name, {}),
        });
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* -------- documents -------- */
  const [doc, setDoc] = useState({ doc_type: DOC_TYPES[0]!, reference: "", amount: "" });
  const addDoc = useMutation({
    mutationFn: () =>
      insertRow("employee_documents", {
        team_member_id: memberId,
        doc_type: doc.doc_type,
        reference: doc.reference || null,
        amount: doc.amount ? Number(doc.amount) : null,
        status: "Received",
        issued_on: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => {
      setDoc({ doc_type: DOC_TYPES[0]!, reference: "", amount: "" });
      invalidate();
      toast.success("Document recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* -------- letters -------- */
  const [letterType, setLetterType] = useState(LETTER_TYPES[0]!);
  const [letterReason, setLetterReason] = useState("");
  const issueLetter = useMutation({
    mutationFn: () =>
      insertRow("hr_letters", {
        team_member_id: memberId,
        letter_type: letterType,
        subject: letterType,
        body: letterBody(letterType, member?.full_name ?? "Employee", { reason: letterReason }),
      }),
    onSuccess: () => {
      setLetterReason("");
      invalidate();
      toast.success("Letter issued");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* -------- exit -------- */
  const [exit, setExit] = useState({ exit_type: "Resignation", exit_date: new Date().toISOString().slice(0, 10), exit_reason: "" });
  const processExit = useMutation({
    mutationFn: async () => {
      if (!record) throw new Error("Create the employee file first.");
      if (memberDocs.some((d) => d.doc_type === "Security Cheque" && d.status === "Received"))
        throw new Error("Return the security cheque before clearing the exit.");
      await updateRow("employee_records", record.id, {
        exit_type: exit.exit_type,
        exit_date: exit.exit_date,
        exit_reason: exit.exit_reason || null,
        employment_status: exit.exit_type === "Termination" ? "Terminated" : "Resigned",
        clearance_done: true,
        updated_at: new Date().toISOString(),
      });
      await supabaseDeactivate(memberId);
      await insertRow("hr_letters", {
        team_member_id: memberId,
        letter_type: "Relieving Letter",
        subject: "Relieving and clearance",
        body: letterBody("Relieving Letter", member?.full_name ?? "Employee", { effective: exit.exit_date }),
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Exit processed and relieving letter issued");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={IdCard}
        title="Employee Files"
        subtitle="Documents, security cheques, agreements, confirmation, letters, certificates and exit clearance."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Employees" value={String(members.filter((m) => m.is_active).length)} />
        <StatCard label="Files created" value={String(records.length)} />
        <StatCard label="Pending documents" value={String(docs.filter((d) => d.status === "Pending").length)} tone="text-amber-500" />
        <StatCard label="Security cheques pending" value={String(pendingSecurity)} tone={pendingSecurity ? "text-red-400" : undefined} />
      </div>

      <Panel>
        <div className="space-y-2 max-w-sm">
          <Label htmlFor="w_member">Employee</Label>
          <select id="w_member" className={selectClass} value={memberId} onChange={(e) => setSelected(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </div>
      </Panel>

      {!member && <EmptyRow>No team members yet. Hire from Recruitment first.</EmptyRow>}

      {member && (
        <>
          <Panel title="Employment record" description={record ? `Status: ${record.employment_status}` : "No file created yet"}>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="w_desig">Designation</Label>
                <Input id="w_desig" className="bg-panel2" defaultValue={record?.designation ?? ""} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w_terr">Territory</Label>
                <Input id="w_terr" className="bg-panel2" defaultValue={record?.territory ?? ""} onChange={(e) => setForm({ ...form, territory: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w_join">Joining date</Label>
                <Input id="w_join" type="date" className="bg-panel2" defaultValue={record?.joining_date ?? ""} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="w_sal">Base salary</Label>
                <Input id="w_sal" type="number" min="0" className="bg-panel2" defaultValue={record?.base_salary ?? ""} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} />
              </div>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveRecord.mutate()} disabled={saveRecord.isPending}>Save file</Button>
                <Button variant="secondary" onClick={() => setStatus.mutate("Confirmed")} disabled={setStatus.isPending}>Confirm employment</Button>
                <Button variant="ghost" onClick={() => setStatus.mutate("Suspended")} disabled={setStatus.isPending}>Suspend</Button>
              </div>
            )}
          </Panel>

          <Panel title="Documents & security" description="Onboarding checklist. Confirmation is blocked while any item is pending.">
            <div className="space-y-2">
              {memberDocs.length === 0 && <EmptyRow>No documents recorded.</EmptyRow>}
              {memberDocs.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                  <span className="font-medium">{d.doc_type}</span>
                  {d.reference ? <span className="text-xs text-muted-foreground">{d.reference}</span> : null}
                  {d.amount ? <span className="text-xs text-muted-foreground">{currency(Number(d.amount))}</span> : null}
                  <Pill tone={d.status === "Pending" ? "amber" : d.status === "Verified" ? "green" : "muted"}>{d.status}</Pill>
                  {canManage && (
                    <select
                      className={`${selectClass} ml-auto w-36`}
                      aria-label={`Status for ${d.doc_type}`}
                      value={d.status}
                      onChange={async (e) => {
                        await updateRow("employee_documents", d.id, { status: e.target.value });
                        invalidate();
                      }}
                    >
                      {["Pending", "Received", "Verified", "Returned", "Expired"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
            {canManage && (
              <div className="grid gap-3 sm:grid-cols-4 border-t border-line pt-4">
                <div className="space-y-2">
                  <Label htmlFor="d_type">Document</Label>
                  <select id="d_type" className={selectClass} value={doc.doc_type} onChange={(e) => setDoc({ ...doc, doc_type: e.target.value })}>
                    {DOC_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d_ref">Reference</Label>
                  <Input id="d_ref" className="bg-panel2" value={doc.reference} onChange={(e) => setDoc({ ...doc, reference: e.target.value })} placeholder="Cheque / doc no." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d_amt">Amount</Label>
                  <Input id="d_amt" type="number" min="0" className="bg-panel2" value={doc.amount} onChange={(e) => setDoc({ ...doc, amount: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <Button onClick={() => addDoc.mutate()} disabled={addDoc.isPending}><Plus className="size-4" /> Record</Button>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Letters & certificates">
            {canManage && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="l_type">Letter</Label>
                  <select id="l_type" className={selectClass} value={letterType} onChange={(e) => setLetterType(e.target.value)}>
                    {LETTER_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="l_reason">Reason / context</Label>
                  <Input id="l_reason" className="bg-panel2" value={letterReason} onChange={(e) => setLetterReason(e.target.value)} />
                </div>
                <div>
                  <Button onClick={() => issueLetter.mutate()} disabled={issueLetter.isPending}><FileText className="size-4" /> Issue</Button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {memberLetters.length === 0 && <EmptyRow>No letters issued.</EmptyRow>}
              {memberLetters.map((l) => (
                <details key={l.id} className="rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                  <summary className="cursor-pointer">
                    {l.letter_type} · <span className="text-xs text-muted-foreground">{shortDate(l.issued_on)}</span>
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{l.body}</pre>
                </details>
              ))}
            </div>
          </Panel>

          {canManage && (
            <Panel title="Resignation / termination & exit clearance">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="e_type">Type</Label>
                  <select id="e_type" className={selectClass} value={exit.exit_type} onChange={(e) => setExit({ ...exit, exit_type: e.target.value })}>
                    {["Resignation", "Termination", "Contract End"].map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e_date">Effective</Label>
                  <Input id="e_date" type="date" className="bg-panel2" value={exit.exit_date} onChange={(e) => setExit({ ...exit, exit_date: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="e_reason">Reason</Label>
                  <Textarea id="e_reason" className="bg-panel2" value={exit.exit_reason} onChange={(e) => setExit({ ...exit, exit_reason: e.target.value })} />
                </div>
              </div>
              <Button variant="destructive" onClick={() => processExit.mutate()} disabled={processExit.isPending}>
                <LogOut className="size-4" /> Process exit & clearance
              </Button>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

async function supabaseDeactivate(memberId: string) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { error } = await supabase.from("team_members").update({ is_active: false }).eq("id", memberId);
  if (error) throw error;
}
