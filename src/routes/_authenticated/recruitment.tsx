import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Plus, Trash2, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyRow, PageHeader, Panel, Pill, StatCard, selectClass } from "@/components/crm/WorkforceUI";
import { fetchMyAccess } from "@/lib/comms-queries";
import {
  deleteRow,
  hireApplicant,
  insertRow,
  listRows,
  nextStages,
  stageBlocked,
  updateRow,
  type ApplicationStage,
} from "@/lib/workforce-queries";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/recruitment")({
  component: RecruitmentPage,
  head: () => ({
    meta: [
      { title: "Recruitment & Hiring | Salforce AI" },
      {
        name: "description",
        content:
          "Post sales openings, screen applicants, run interviews and tests, approve selection and convert hires into onboarded employees.",
      },
      { property: "og:title", content: "Recruitment & Hiring | Salforce AI" },
      { property: "og:description", content: "Applications, screening, interviews, approval and onboarding." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function RecruitmentPage() {
  const qc = useQueryClient();
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const canManage = Boolean(access?.isSuperAdmin || access?.isCompanyAdmin);

  const { data: openings = [] } = useQuery({
    queryKey: ["job-openings"],
    queryFn: () => listRows("job_openings"),
  });
  const { data: applications = [] } = useQuery({
    queryKey: ["job-applications"],
    queryFn: () => listRows("job_applications"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["job-openings"] });
    qc.invalidateQueries({ queryKey: ["job-applications"] });
    qc.invalidateQueries({ queryKey: ["team-members"] });
    qc.invalidateQueries({ queryKey: ["employee-records"] });
  };

  const [title, setTitle] = useState("");
  const [territory, setTerritory] = useState("");
  const [headcount, setHeadcount] = useState("1");

  const addOpening = useMutation({
    mutationFn: () =>
      insertRow("job_openings", {
        title,
        territory: territory || null,
        headcount: Math.max(1, Number(headcount || 1)),
      }),
    onSuccess: () => {
      setTitle("");
      setTerritory("");
      setHeadcount("1");
      invalidate();
      toast.success("Opening posted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [app, setApp] = useState({ full_name: "", phone: "", email: "", city: "", experience_years: "0", opening_id: "" });
  const addApplication = useMutation({
    mutationFn: () =>
      insertRow("job_applications", {
        full_name: app.full_name,
        phone: app.phone || null,
        email: app.email || null,
        city: app.city || null,
        experience_years: Number(app.experience_years || 0),
        opening_id: app.opening_id || null,
      }),
    onSuccess: () => {
      setApp({ full_name: "", phone: "", email: "", city: "", experience_years: "0", opening_id: "" });
      invalidate();
      toast.success("Application recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const live = applications.filter((a) => !["Hired", "Rejected"].includes(a.stage));
  const hired = applications.filter((a) => a.stage === "Hired");

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UserPlus}
        title="Recruitment & Hiring"
        subtitle="Application → screening → interview → test → approval → onboarding → employee file."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Open positions" value={String(openings.filter((o) => o.status === "Open").length)} />
        <StatCard label="Live applications" value={String(live.length)} />
        <StatCard label="Hired" value={String(hired.length)} tone="text-teal" />
        <StatCard label="Rejected" value={String(applications.filter((a) => a.stage === "Rejected").length)} />
      </div>

      {canManage && (
        <Panel title="Post an opening" description="Openings drive the hiring funnel and headcount control.">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="o_title">Position</Label>
              <Input id="o_title" className="bg-panel2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sales Officer" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="o_terr">Territory</Label>
              <Input id="o_terr" className="bg-panel2" value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="Lahore North" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="o_head">Headcount</Label>
              <Input id="o_head" type="number" min="1" className="bg-panel2" value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => addOpening.mutate()} disabled={!title || addOpening.isPending}>
                <Plus className="size-4" /> Post
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {openings.length === 0 && <EmptyRow>No openings posted yet.</EmptyRow>}
            {openings.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                <span className="font-medium">{o.title}</span>
                <span className="text-muted-foreground text-xs">{o.territory ?? "Any territory"} · {o.headcount} seat(s)</span>
                <Pill tone={o.status === "Open" ? "green" : "muted"}>{o.status}</Pill>
                <div className="ml-auto flex gap-2">
                  <select
                    className={`${selectClass} w-36`}
                    value={o.status}
                    aria-label={`Status for ${o.title}`}
                    onChange={async (e) => {
                      await updateRow("job_openings", o.id, { status: e.target.value });
                      invalidate();
                    }}
                  >
                    {["Open", "On Hold", "Closed"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${o.title}`}
                    onClick={async () => {
                      await deleteRow("job_openings", o.id);
                      invalidate();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {canManage && (
        <Panel title="Add applicant">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="a_name">Candidate</Label>
              <Input id="a_name" className="bg-panel2" value={app.full_name} onChange={(e) => setApp({ ...app, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a_phone">Phone</Label>
              <Input id="a_phone" className="bg-panel2" value={app.phone} onChange={(e) => setApp({ ...app, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a_email">Email</Label>
              <Input id="a_email" className="bg-panel2" value={app.email} onChange={(e) => setApp({ ...app, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a_city">City</Label>
              <Input id="a_city" className="bg-panel2" value={app.city} onChange={(e) => setApp({ ...app, city: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a_open">Opening</Label>
              <select id="a_open" className={selectClass} value={app.opening_id} onChange={(e) => setApp({ ...app, opening_id: e.target.value })}>
                <option value="">Unassigned</option>
                {openings.filter((o) => o.status === "Open").map((o) => (
                  <option key={o.id} value={o.id}>{o.title}</option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={() => addApplication.mutate()} disabled={!app.full_name || addApplication.isPending}>
            <Plus className="size-4" /> Add applicant
          </Button>
        </Panel>
      )}

      <div className="space-y-3">
        {applications.length === 0 && <EmptyRow>No applications yet.</EmptyRow>}
        {applications.map((a) => (
          <ApplicantCard key={a.id} app={a} canManage={canManage} onChanged={invalidate} />
        ))}
      </div>
    </div>
  );
}

type Application = Awaited<ReturnType<typeof listRows<"job_applications">>>[number];

function ApplicantCard({
  app,
  canManage,
  onChanged,
}: {
  app: Application;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [scores, setScores] = useState({
    screening_score: app.screening_score?.toString() ?? "",
    interview_score: app.interview_score?.toString() ?? "",
    test_score: app.test_score?.toString() ?? "",
  });
  const [notes, setNotes] = useState(app.decision_notes ?? "");
  const [joining, setJoining] = useState(new Date().toISOString().slice(0, 10));
  const [salary, setSalary] = useState("50000");

  const saveScores = useMutation({
    mutationFn: () =>
      updateRow("job_applications", app.id, {
        screening_score: scores.screening_score === "" ? null : Number(scores.screening_score),
        interview_score: scores.interview_score === "" ? null : Number(scores.interview_score),
        test_score: scores.test_score === "" ? null : Number(scores.test_score),
        decision_notes: notes || null,
        updated_at: new Date().toISOString(),
      }),
    onSuccess: () => {
      onChanged();
      toast.success("Evaluation saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advance = useMutation({
    mutationFn: async (stage: ApplicationStage) => {
      const blocked = stageBlocked(app, stage);
      if (blocked) throw new Error(blocked);
      await updateRow("job_applications", app.id, {
        stage,
        approved_at: stage === "Approved" ? new Date().toISOString() : app.approved_at,
        updated_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      onChanged();
      toast.success("Stage updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hire = useMutation({
    mutationFn: () => hireApplicant(app, joining, Number(salary || 0)),
    onSuccess: () => {
      onChanged();
      toast.success("Employee created with onboarding checklist");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tone = app.stage === "Hired" ? "green" : app.stage === "Rejected" ? "red" : "blue";

  return (
    <div className="rounded-lg bg-panel border border-line p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="font-medium">{app.full_name}</div>
          <div className="text-xs text-muted-foreground">
            {app.city ?? "—"} · {Number(app.experience_years)} yrs exp · applied {shortDate(app.created_at)}
          </div>
        </div>
        <Pill tone={tone}>{app.stage}</Pill>
      </div>

      {canManage && app.stage !== "Hired" && app.stage !== "Rejected" && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {(["screening_score", "interview_score", "test_score"] as const).map((k) => (
              <div key={k} className="space-y-2">
                <Label htmlFor={`${app.id}_${k}`}>{k.replace("_score", "")} score</Label>
                <Input
                  id={`${app.id}_${k}`}
                  type="number"
                  min="0"
                  max="100"
                  className="bg-panel2"
                  value={scores[k]}
                  onChange={(e) => setScores({ ...scores, [k]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex items-end">
              <Button variant="secondary" onClick={() => saveScores.mutate()} disabled={saveScores.isPending}>
                Save evaluation
              </Button>
            </div>
          </div>
          <Textarea
            className="bg-panel2"
            placeholder="Decision notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {nextStages(app.stage).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === "Rejected" ? "ghost" : "default"}
                onClick={() => advance.mutate(s)}
                disabled={advance.isPending}
              >
                Move to {s}
              </Button>
            ))}
          </div>
        </>
      )}

      {canManage && app.stage === "Onboarding" && (
        <div className="grid gap-3 sm:grid-cols-3 border-t border-line pt-4">
          <div className="space-y-2">
            <Label htmlFor={`${app.id}_join`}>Joining date</Label>
            <Input id={`${app.id}_join`} type="date" className="bg-panel2" value={joining} onChange={(e) => setJoining(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${app.id}_sal`}>Monthly salary</Label>
            <Input id={`${app.id}_sal`} type="number" min="0" className="bg-panel2" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => hire.mutate()} disabled={hire.isPending}>
              <BadgeCheck className="size-4" /> Create employee
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
