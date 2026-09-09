import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requirePlatformOwnerRoute } from "@/lib/platform-route-guard";
import {
  getPlatformBrand,
  getReferralAnalytics,
  getReferralProgram,
  savePlatformBrand,
  saveReferralProgram,
  setReferralReward,
  type PlatformBrand,
  type ReferralProgram,
} from "@/lib/referral-admin.functions";

export const Route = createFileRoute("/_authenticated/platform/referrals")({
  beforeLoad: requirePlatformOwnerRoute,
  head: () => ({
    meta: [
      { title: "Brand & Referrals | Manuta CRM" },
      {
        name: "description",
        content:
          "Platform owner controls for Manuta CRM brand assets, the referral reward programme and referral performance analytics.",
      },
      { property: "og:title", content: "Brand & Referrals | Manuta CRM" },
      {
        property: "og:description",
        content: "Configure Manuta CRM branding, referral rewards and track referral performance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlatformReferralsPage,
});

const REWARD_TYPES = [
  { value: "subscription_extension", label: "Subscription extension (days)" },
  { value: "bonus_seat", label: "Bonus user seats" },
  { value: "feature_upgrade", label: "Temporary feature upgrade (days)" },
  { value: "account_credit", label: "Account credit" },
];

const QUALIFICATIONS = [
  { value: "company_activated", label: "Referred company becomes active" },
  { value: "account_created", label: "Referred account is created" },
  { value: "first_payment", label: "Referred company's first payment" },
];

function PlatformReferralsPage() {
  const qc = useQueryClient();
  const programFn = useServerFn(getReferralProgram);
  const saveProgramFn = useServerFn(saveReferralProgram);
  const analyticsFn = useServerFn(getReferralAnalytics);
  const rewardFn = useServerFn(setReferralReward);
  const brandFn = useServerFn(getPlatformBrand);
  const saveBrandFn = useServerFn(savePlatformBrand);

  const { data: program } = useQuery({ queryKey: ["referral-program"], queryFn: () => programFn({}) });
  const { data: stats } = useQuery({ queryKey: ["referral-analytics"], queryFn: () => analyticsFn({}) });
  const { data: brand } = useQuery({ queryKey: ["platform-brand"], queryFn: () => brandFn({}) });

  const [form, setForm] = useState<ReferralProgram | null>(null);
  const [brandForm, setBrandForm] = useState<PlatformBrand | null>(null);
  useEffect(() => { if (program) setForm(program); }, [program]);
  useEffect(() => { if (brand) setBrandForm(brand); }, [brand]);

  const saveProgram = useMutation({
    mutationFn: () => saveProgramFn({ data: form! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-program"] });
      toast.success("Referral programme updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBrand = useMutation({
    mutationFn: () => saveBrandFn({ data: brandForm! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-brand"] });
      toast.success("Brand assets updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reward = useMutation({
    mutationFn: (input: { id: string; reward_status: "None" | "Pending" | "Granted" }) =>
      rewardFn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-analytics"] });
      toast.success("Reward updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <h1 className="display-title text-2xl">Brand &amp; Referrals</h1>

      <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Total invitations", value: stats?.totalInvitations ?? 0 },
          { label: "Accepted invitations", value: stats?.acceptedInvitations ?? 0 },
          { label: "Referral visits", value: stats?.totalReferrals ?? 0 },
          { label: "Successful referrals", value: stats?.successfulReferrals ?? 0 },
          { label: "Conversion rate", value: `${stats?.conversionRate ?? 0}%` },
          { label: "Pending rewards", value: stats?.pendingRewards ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-line bg-panel p-4">
            <div className="display-title text-2xl">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel p-6 space-y-4">
          <h2 className="display-title text-lg">Referral programme</h2>
          {form && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="rp_enabled">Referral rewards enabled</Label>
                <Switch
                  id="rp_enabled"
                  checked={form.enabled}
                  onCheckedChange={(v) => setForm({ ...form, enabled: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>Reward type</Label>
                <Select
                  value={form.reward_type}
                  onValueChange={(v) => setForm({ ...form, reward_type: v })}
                >
                  <SelectTrigger className="bg-panel2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REWARD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rp_value">Reward value</Label>
                <Input
                  id="rp_value"
                  type="number"
                  min={0}
                  value={form.reward_value}
                  onChange={(e) => setForm({ ...form, reward_value: Number(e.target.value) })}
                  className="bg-panel2"
                />
              </div>
              <div className="space-y-2">
                <Label>Qualification</Label>
                <Select
                  value={form.qualification}
                  onValueChange={(v) => setForm({ ...form, qualification: v })}
                >
                  <SelectTrigger className="bg-panel2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALIFICATIONS.map((q) => (
                      <SelectItem key={q.value} value={q.value}>
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="rp_approval">Rewards need my approval</Label>
                <Switch
                  id="rp_approval"
                  checked={form.requires_approval}
                  onCheckedChange={(v) => setForm({ ...form, requires_approval: v })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rp_terms">Terms shown to members</Label>
                <Textarea
                  id="rp_terms"
                  rows={3}
                  value={form.terms ?? ""}
                  onChange={(e) => setForm({ ...form, terms: e.target.value })}
                  className="bg-panel2"
                />
              </div>
              <Button onClick={() => saveProgram.mutate()} disabled={saveProgram.isPending}>
                {saveProgram.isPending ? "Saving…" : "Save programme"}
              </Button>
            </>
          )}
        </div>

        <div className="rounded-lg border border-line bg-panel p-6 space-y-4">
          <h2 className="display-title text-lg">Manuta CRM brand assets</h2>
          <p className="text-xs text-muted-foreground">
            Leave a field empty to use the built-in Manuta CRM assets. URLs must be public https
            addresses.
          </p>
          {brandForm &&
            (
              [
                ["logoUrl", "Product logo"],
                ["faviconUrl", "Favicon"],
                ["pwaIconUrl", "Mobile app icon"],
                ["emailLogoUrl", "Email logo"],
              ] as [keyof PlatformBrand, string][]
            ).map(([field, label]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`br_${field}`}>{label}</Label>
                <Input
                  id={`br_${field}`}
                  value={brandForm[field] ?? ""}
                  onChange={(e) => setBrandForm({ ...brandForm, [field]: e.target.value })}
                  placeholder="https://…"
                  className="bg-panel2"
                />
              </div>
            ))}
          <Button onClick={() => saveBrand.mutate()} disabled={saveBrand.isPending}>
            {saveBrand.isPending ? "Saving…" : "Save brand assets"}
          </Button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel p-6">
          <h2 className="display-title text-lg">Top referrers</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(stats?.topReferrers ?? []).map((r) => (
              <li key={`${r.name}-${r.company}`} className="flex justify-between border-b border-line/60 pb-2">
                <span>
                  {r.name}
                  {r.company && <span className="text-muted-foreground"> · {r.company}</span>}
                </span>
                <span className="text-brand font-semibold">{r.joined}</span>
              </li>
            ))}
            {!stats?.topReferrers.length && (
              <li className="text-sm text-muted-foreground">No successful referrals yet.</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-line bg-panel p-6">
          <h2 className="display-title text-lg">Recent referrals</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-line">
                  <th className="text-left py-2">Code</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Reward</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {(stats?.recent ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-line/60">
                    <td className="py-2 font-mono text-xs">{r.code}</td>
                    <td className="py-2">{r.status}</td>
                    <td className="py-2">{r.reward_status}</td>
                    <td className="py-2 text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => reward.mutate({ id: r.id, reward_status: "Pending" })}
                      >
                        Pending
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reward.mutate({ id: r.id, reward_status: "Granted" })}
                      >
                        Grant
                      </Button>
                    </td>
                  </tr>
                ))}
                {!stats?.recent.length && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No referral activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
