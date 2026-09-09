import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Gift, Mail, MessageCircle, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createInvitation,
  getMyReferral,
  listInvitations,
  revokeInvitation,
  type InviteRole,
} from "@/lib/invites.functions";

export const Route = createFileRoute("/_authenticated/invite")({
  head: () => ({
    meta: [
      { title: "Invite & Grow | Manuta CRM" },
      {
        name: "description",
        content:
          "Invite teammates to your Manuta CRM workspace or introduce another business to the platform, and follow every invitation from sent to activated.",
      },
      { property: "og:title", content: "Invite & Grow | Manuta CRM" },
      {
        property: "og:description",
        content: "Grow your team and refer other businesses to Manuta CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvitePage,
});

const ROLE_LABEL: Record<InviteRole, string> = {
  admin: "Administrator",
  store_manager: "Store Manager",
  support_agent: "Support Agent",
};

function InvitePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"team" | "business">("team");

  const invitesFn = useServerFn(listInvitations);
  const createFn = useServerFn(createInvitation);
  const revokeFn = useServerFn(revokeInvitation);
  const referralFn = useServerFn(getMyReferral);

  const { data: invites } = useQuery({ queryKey: ["invitations"], queryFn: () => invitesFn({}) });
  const { data: referral } = useQuery({
    queryKey: ["my-referral"],
    queryFn: () => referralFn({ data: { origin: window.location.origin } }),
  });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("support_agent");
  const [message, setMessage] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () =>
      createFn({
        data: { fullName, email, role, message, origin: window.location.origin },
      }),
    onSuccess: (res) => {
      setLastLink(res.inviteUrl);
      setFullName("");
      setEmail("");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation created — share the secure link with your teammate.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareText = referral
    ? `I'm using Manuta CRM to manage customers, sales and communications in one place. You can explore it here: ${referral.link}`
    : "";

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  return (
    <div className="space-y-8">
      <header className="rounded-lg border border-line bg-panel px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex items-center gap-2 text-brand text-xs uppercase tracking-wider">
          <Sparkles className="size-4" /> Invite &amp; Grow
        </div>
        <h1 className="display-title text-3xl sm:text-4xl mt-3">Great teams grow together.</h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-xl">
          Invite your team or introduce another business to Manuta CRM.
        </p>
        <div className="mt-6 flex gap-2">
          <Button
            variant={tab === "team" ? "default" : "outline"}
            onClick={() => setTab("team")}
            className="gap-2"
          >
            <Users className="size-4" /> Invite team member
          </Button>
          <Button
            variant={tab === "business" ? "default" : "outline"}
            onClick={() => setTab("business")}
            className="gap-2"
          >
            <Gift className="size-4" /> Refer another business
          </Button>
        </div>
      </header>

      {tab === "team" ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
            className="rounded-lg border border-line bg-panel p-6 space-y-4"
          >
            <h2 className="display-title text-lg">Invite a teammate</h2>
            <div className="space-y-2">
              <Label htmlFor="iv_name">Name</Label>
              <Input
                id="iv_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-panel2"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iv_email">Email</Label>
              <Input
                id="iv_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-panel2"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iv_role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                <SelectTrigger id="iv_role" className="bg-panel2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABEL) as InviteRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="iv_msg">Personal message (optional)</Label>
              <Textarea
                id="iv_msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="bg-panel2"
                rows={3}
                placeholder="Joining our workspace so we can handle orders and customer chats together."
              />
            </div>
            <Button type="submit" disabled={send.isPending} className="w-full">
              {send.isPending ? "Creating invitation…" : "Send invitation"}
            </Button>
            {lastLink && (
              <div className="rounded-md border border-brand/40 bg-brand/10 p-3 text-xs space-y-2">
                <p className="text-muted-foreground">
                  Secure invitation link (valid 14 days, single use):
                </p>
                <p className="break-all font-mono text-[11px]">{lastLink}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(lastLink, "Invite link")}>
                    <Copy className="size-3.5 mr-1" /> Copy link
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`You're invited to our Manuta CRM workspace: ${lastLink}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-3.5 mr-1" /> WhatsApp
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={`mailto:?subject=${encodeURIComponent("Your Manuta CRM invitation")}&body=${encodeURIComponent(`You're invited to our Manuta CRM workspace.\n\nSet up your account here: ${lastLink}`)}`}
                    >
                      <Mail className="size-3.5 mr-1" /> Email
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </form>

          <div className="rounded-lg border border-line bg-panel p-6">
            <h2 className="display-title text-lg">Invitations</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-line">
                    <th className="text-left py-2">Person</th>
                    <th className="text-left py-2">Role</th>
                    <th className="text-left py-2">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(invites ?? []).map((i) => (
                    <tr key={i.id} className="border-b border-line/60">
                      <td className="py-2.5">
                        <div className="font-medium">{i.full_name || i.email}</div>
                        <div className="text-xs text-muted-foreground">{i.email}</div>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {ROLE_LABEL[i.role_title as InviteRole] ?? i.role_title}
                      </td>
                      <td className="py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded bg-panel2 border border-line">
                          {i.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        {["Invited", "Opened"].includes(i.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => revoke.mutate(i.id)}
                            disabled={revoke.isPending}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!invites?.length && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No invitations yet. Invite your first teammate above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-panel p-6 space-y-4">
            <h2 className="display-title text-lg">Your referral link</h2>
            <p className="text-sm text-muted-foreground">
              Share Manuta CRM with another business. Your link is unique to you and never exposes
              your company details.
            </p>
            <div className="rounded-md border border-line bg-panel2 px-3 py-2 font-mono text-xs break-all">
              {referral?.link ?? "Preparing your link…"}
            </div>
            <Textarea
              value={shareText}
              onChange={() => undefined}
              readOnly
              rows={3}
              className="bg-panel2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!referral}
                onClick={() => copy(referral!.link, "Referral link")}
              >
                <Copy className="size-4 mr-1.5" /> Copy link
              </Button>
              <Button variant="outline" disabled={!referral} asChild>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4 mr-1.5" /> WhatsApp
                </a>
              </Button>
              <Button variant="outline" disabled={!referral} asChild>
                <a
                  href={`mailto:?subject=${encodeURIComponent("Have you seen Manuta CRM?")}&body=${encodeURIComponent(shareText)}`}
                >
                  <Mail className="size-4 mr-1.5" /> Email
                </a>
              </Button>
              <Button variant="ghost" disabled={!referral} onClick={() => copy(shareText, "Message")}>
                Copy message
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel p-6">
            <h2 className="display-title text-lg">Your invites</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: "Invited", value: referral?.invited ?? 0 },
                { label: "Joined", value: referral?.joined ?? 0 },
                { label: "Activated", value: referral?.activated ?? 0 },
                { label: "Rewards earned", value: referral?.rewardsEarned ?? 0 },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-line bg-panel2 p-4">
                  <div className="display-title text-2xl">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              {referral?.program.enabled
                ? referral.program.terms ||
                  "A reward campaign is currently running. Qualifying referrals are reviewed before rewards are granted."
                : "No reward campaign is running right now — invitations and referrals still work normally."}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
