import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Plus, LogIn, LogOut, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyRow, PageHeader, Panel, Pill, StatCard, selectClass } from "@/components/crm/WorkforceUI";
import { fetchMyAccess, fetchTeamMembers } from "@/lib/comms-queries";
import { fetchCustomers } from "@/lib/crm-queries";
import { deleteRow, insertRow, listRows, updateRow } from "@/lib/workforce-queries";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/field")({
  component: FieldPage,
  head: () => ({
    meta: [
      { title: "Territory, Journey Plans & Visits | Salforce AI" },
      {
        name: "description",
        content:
          "Allocate territories and customers, file daily journey plans, check in and out of visits and record attendance for the sales force.",
      },
      { property: "og:title", content: "Territory, Journey Plans & Visits | Salforce AI" },
      { property: "og:description", content: "Journey planning, visit execution and attendance control." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const today = () => new Date().toISOString().slice(0, 10);

function FieldPage() {
  const qc = useQueryClient();
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const canManage = Boolean(access?.isSuperAdmin || access?.isCompanyAdmin);
  const myMemberId = access?.memberId ?? null;

  const { data: members = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: territories = [] } = useQuery({ queryKey: ["territories"], queryFn: () => listRows("territories") });
  const { data: allocations = [] } = useQuery({ queryKey: ["customer-allocations"], queryFn: () => listRows("customer_allocations") });
  const { data: plans = [] } = useQuery({ queryKey: ["journey-plans"], queryFn: () => listRows("journey_plans", "plan_date") });
  const { data: visits = [] } = useQuery({ queryKey: ["visits"], queryFn: () => listRows("visits", "visit_date") });
  const { data: attendance = [] } = useQuery({ queryKey: ["attendance"], queryFn: () => listRows("attendance_records", "work_date") });

  const invalidate = () =>
    ["territories", "customer-allocations", "journey-plans", "visits", "attendance"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );

  const [terr, setTerr] = useState({ name: "", city: "", team_member_id: "" });
  const addTerritory = useMutation({
    mutationFn: () =>
      insertRow("territories", {
        name: terr.name,
        city: terr.city || null,
        team_member_id: terr.team_member_id || null,
      }),
    onSuccess: () => {
      setTerr({ name: "", city: "", team_member_id: "" });
      invalidate();
      toast.success("Territory added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [alloc, setAlloc] = useState({ customer_id: "", team_member_id: "", territory_id: "", visit_frequency_days: "30" });
  const addAllocation = useMutation({
    mutationFn: () => {
      if (!alloc.customer_id || !alloc.team_member_id) throw new Error("Select a customer and an owner.");
      return insertRow("customer_allocations", {
        customer_id: alloc.customer_id,
        team_member_id: alloc.team_member_id,
        territory_id: alloc.territory_id || null,
        visit_frequency_days: Number(alloc.visit_frequency_days || 30),
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Customer allocated");
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "That customer is already allocated to this person." : e.message),
  });

  const [plan, setPlan] = useState({ team_member_id: "", plan_date: today(), territory_id: "", planned_visits: "8" });
  const addPlan = useMutation({
    mutationFn: () => {
      const owner = plan.team_member_id || myMemberId;
      if (!owner) throw new Error("Select the field member for this plan.");
      return insertRow("journey_plans", {
        team_member_id: owner,
        plan_date: plan.plan_date,
        territory_id: plan.territory_id || null,
        planned_visits: Number(plan.planned_visits || 0),
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Journey plan filed");
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "A plan already exists for that person and date." : e.message),
  });

  const [visit, setVisit] = useState({ customer_id: "", team_member_id: "" });
  const startVisit = useMutation({
    mutationFn: () => {
      const owner = visit.team_member_id || myMemberId;
      if (!owner) throw new Error("Select the field member.");
      if (!visit.customer_id) throw new Error("Select a customer.");
      const plan_id = plans.find((p) => p.team_member_id === owner && p.plan_date === today())?.id ?? null;
      return insertRow("visits", {
        team_member_id: owner,
        customer_id: visit.customer_id,
        plan_id,
        visit_date: today(),
        checked_in_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Checked in");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeVisit = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: string }) =>
      updateRow("visits", id, { outcome, checked_out_at: new Date().toISOString() }),
    onSuccess: () => {
      invalidate();
      toast.success("Visit closed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markAttendance = useMutation({
    mutationFn: async ({ memberId, status }: { memberId: string; status: string }) => {
      const existing = attendance.find((a) => a.team_member_id === memberId && a.work_date === today());
      if (existing) await updateRow("attendance_records", existing.id, { status });
      else
        await insertRow("attendance_records", {
          team_member_id: memberId,
          work_date: today(),
          status,
          check_in_at: new Date().toISOString(),
        });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Attendance saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const todaysVisits = visits.filter((v) => v.visit_date === today());
  const openVisits = todaysVisits.filter((v) => v.outcome === "Pending");
  const plannedToday = plans.filter((p) => p.plan_date === today()).reduce((s, p) => s + p.planned_visits, 0);
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.full_name ?? "—";
  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MapPin}
        title="Territory, Journey Plans & Visits"
        subtitle="Allocation, daily planning, visit execution and attendance — the field discipline layer."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Planned visits today" value={String(plannedToday)} />
        <StatCard label="Visits closed" value={String(todaysVisits.length - openVisits.length)} tone="text-teal" />
        <StatCard label="Open visits" value={String(openVisits.length)} tone={openVisits.length ? "text-amber-500" : undefined} />
        <StatCard label="Allocated customers" value={String(allocations.length)} />
      </div>

      <Panel title="Today's attendance">
        <div className="space-y-2">
          {members.filter((m) => m.is_active).length === 0 && <EmptyRow>No active team members.</EmptyRow>}
          {members
            .filter((m) => m.is_active)
            .map((m) => {
              const rec = attendance.find((a) => a.team_member_id === m.id && a.work_date === today());
              const canEdit = canManage || myMemberId === m.id;
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                  <span className="font-medium">{m.full_name}</span>
                  <Pill tone={!rec ? "muted" : rec.status === "Absent" ? "red" : rec.status === "Present" ? "green" : "amber"}>
                    {rec?.status ?? "Not marked"}
                  </Pill>
                  {canEdit && (
                    <select
                      className={`${selectClass} ml-auto w-36`}
                      aria-label={`Attendance for ${m.full_name}`}
                      value={rec?.status ?? ""}
                      onChange={(e) => markAttendance.mutate({ memberId: m.id, status: e.target.value })}
                    >
                      <option value="" disabled>Mark…</option>
                      {["Present", "Late", "Half Day", "Leave", "Absent", "Holiday"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
        </div>
      </Panel>

      <Panel title="Journey plan" description="One plan per person per day. Visits are measured against it.">
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="p_member">Field member</Label>
            <select id="p_member" className={selectClass} value={plan.team_member_id} onChange={(e) => setPlan({ ...plan, team_member_id: e.target.value })}>
              <option value="">{myMemberId ? "Myself" : "Select…"}</option>
              {members.map((m) => (<option key={m.id} value={m.id}>{m.full_name}</option>))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p_date">Date</Label>
            <Input id="p_date" type="date" className="bg-panel2" value={plan.plan_date} onChange={(e) => setPlan({ ...plan, plan_date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p_terr">Territory</Label>
            <select id="p_terr" className={selectClass} value={plan.territory_id} onChange={(e) => setPlan({ ...plan, territory_id: e.target.value })}>
              <option value="">Any</option>
              {territories.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p_count">Planned visits</Label>
            <Input id="p_count" type="number" min="0" className="bg-panel2" value={plan.planned_visits} onChange={(e) => setPlan({ ...plan, planned_visits: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => addPlan.mutate()} disabled={addPlan.isPending}><CalendarCheck className="size-4" /> File plan</Button>
          </div>
        </div>
        <div className="space-y-2">
          {plans.slice(0, 8).map((p) => {
            const done = visits.filter((v) => v.plan_id === p.id && v.outcome !== "Pending").length;
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                <span className="font-medium">{memberName(p.team_member_id)}</span>
                <span className="text-xs text-muted-foreground">{shortDate(p.plan_date)}</span>
                <span className="text-xs">{done}/{p.planned_visits} closed</span>
                <Pill tone={done >= p.planned_visits ? "green" : "amber"}>{done >= p.planned_visits ? "Completed" : p.status}</Pill>
                {canManage && (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={async () => { await deleteRow("journey_plans", p.id); invalidate(); }}>
                    Remove
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Visits" description="Check in on arrival, close with an outcome before day end.">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="v_cust">Customer</Label>
            <select id="v_cust" className={selectClass} value={visit.customer_id} onChange={(e) => setVisit({ ...visit, customer_id: e.target.value })}>
              <option value="">Select…</option>
              {customers.map((c) => (<option key={c.id} value={c.id}>{c.full_name}</option>))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="v_member">Field member</Label>
            <select id="v_member" className={selectClass} value={visit.team_member_id} onChange={(e) => setVisit({ ...visit, team_member_id: e.target.value })}>
              <option value="">{myMemberId ? "Myself" : "Select…"}</option>
              {members.map((m) => (<option key={m.id} value={m.id}>{m.full_name}</option>))}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => startVisit.mutate()} disabled={startVisit.isPending}><LogIn className="size-4" /> Check in</Button>
          </div>
        </div>
        <div className="space-y-2">
          {todaysVisits.length === 0 && <EmptyRow>No visits recorded today.</EmptyRow>}
          {todaysVisits.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
              <span className="font-medium">{customerName(v.customer_id)}</span>
              <span className="text-xs text-muted-foreground">{memberName(v.team_member_id)}</span>
              <Pill tone={v.outcome === "Pending" ? "amber" : v.outcome === "Order" ? "green" : "muted"}>{v.outcome}</Pill>
              {v.outcome === "Pending" && (
                <select
                  className={`${selectClass} ml-auto w-40`}
                  aria-label={`Close visit for ${customerName(v.customer_id)}`}
                  defaultValue=""
                  onChange={(e) => closeVisit.mutate({ id: v.id, outcome: e.target.value })}
                >
                  <option value="" disabled>Close with…</option>
                  {["Order", "No Order", "Not Available", "Follow Up"].map((o) => (<option key={o} value={o}>{o}</option>))}
                </select>
              )}
              {v.checked_out_at && <span className="ml-auto text-xs text-muted-foreground"><LogOut className="inline size-3" /> closed</span>}
            </div>
          ))}
        </div>
      </Panel>

      {canManage && (
        <Panel title="Territories & customer allocation">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="t_name">Territory</Label>
              <Input id="t_name" className="bg-panel2" value={terr.name} onChange={(e) => setTerr({ ...terr, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_city">City</Label>
              <Input id="t_city" className="bg-panel2" value={terr.city} onChange={(e) => setTerr({ ...terr, city: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t_owner">Owner</Label>
              <select id="t_owner" className={selectClass} value={terr.team_member_id} onChange={(e) => setTerr({ ...terr, team_member_id: e.target.value })}>
                <option value="">Unassigned</option>
                {members.map((m) => (<option key={m.id} value={m.id}>{m.full_name}</option>))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => addTerritory.mutate()} disabled={!terr.name || addTerritory.isPending}><Plus className="size-4" /> Add</Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-5 border-t border-line pt-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="al_cust">Customer</Label>
              <select id="al_cust" className={selectClass} value={alloc.customer_id} onChange={(e) => setAlloc({ ...alloc, customer_id: e.target.value })}>
                <option value="">Select…</option>
                {customers.map((c) => (<option key={c.id} value={c.id}>{c.full_name}</option>))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="al_member">Owner</Label>
              <select id="al_member" className={selectClass} value={alloc.team_member_id} onChange={(e) => setAlloc({ ...alloc, team_member_id: e.target.value })}>
                <option value="">Select…</option>
                {members.map((m) => (<option key={m.id} value={m.id}>{m.full_name}</option>))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="al_freq">Visit every (days)</Label>
              <Input id="al_freq" type="number" min="1" className="bg-panel2" value={alloc.visit_frequency_days} onChange={(e) => setAlloc({ ...alloc, visit_frequency_days: e.target.value })} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => addAllocation.mutate()} disabled={addAllocation.isPending}><Plus className="size-4" /> Allocate</Button>
            </div>
          </div>

          <div className="space-y-2">
            {allocations.length === 0 && <EmptyRow>No customers allocated yet.</EmptyRow>}
            {allocations.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                <span className="font-medium">{customerName(a.customer_id)}</span>
                <span className="text-xs text-muted-foreground">→ {memberName(a.team_member_id)} · every {a.visit_frequency_days}d</span>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={async () => { await deleteRow("customer_allocations", a.id); invalidate(); }}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
