import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ManutaBrand } from "@/components/brand/ManutaBrand";
import { acceptInvitation, getInvitation } from "@/lib/invites.functions";

export const Route = createFileRoute("/join/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accept your invitation | Manuta CRM" },
      {
        name: "description",
        content:
          "Set up your Manuta CRM account from a secure, single-use invitation link and join your company workspace.",
      },
      { property: "og:title", content: "Accept your invitation | Manuta CRM" },
      {
        property: "og:description",
        content: "Create your Manuta CRM account and join your team's workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const previewFn = useServerFn(getInvitation);
  const acceptFn = useServerFn(acceptInvitation);

  const { data: invite, isLoading } = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => previewFn({ data: { token } }),
    retry: false,
  });

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (invite?.valid) setFullName(invite.fullName);
  }, [invite]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Both passwords must match");
      return;
    }
    setSaving(true);
    try {
      await acceptFn({ data: { token, fullName, password } });
      toast.success("Your account is ready — please sign in.");
      navigate({ to: "/auth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete setup");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <ManutaBrand size="lg" />

        {isLoading && <p className="mt-8 text-sm text-muted-foreground">Checking invitation…</p>}

        {invite && !invite.valid && (
          <div className="mt-8 rounded-lg border border-line bg-panel p-6">
            <h1 className="display-title text-xl">Invitation unavailable</h1>
            <p className="text-sm text-muted-foreground mt-2">{invite.reason}</p>
            <Button className="mt-5" onClick={() => navigate({ to: "/auth" })}>
              Go to sign in
            </Button>
          </div>
        )}

        {invite?.valid && (
          <form onSubmit={submit} className="mt-8 rounded-lg border border-line bg-panel p-6 space-y-4">
            <h1 className="display-title text-2xl flex items-center gap-2">
              <ShieldCheck className="size-5 text-teal" /> Join {invite.companyName}
            </h1>
            <p className="text-sm text-muted-foreground">
              You&apos;ve been invited to the {invite.companyName} workspace on Manuta CRM.
            </p>
            {invite.message && (
              <p className="rounded-md border border-line bg-panel2 p-3 text-sm italic">
                “{invite.message}”
              </p>
            )}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={invite.email} readOnly className="bg-panel2 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jn_name">Your name</Label>
              <Input
                id="jn_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-panel2"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jn_pw">Create password</Label>
              <Input
                id="jn_pw"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-panel2"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jn_pw2">Confirm password</Label>
              <Input
                id="jn_pw2"
                type="password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="bg-panel2"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Setting up your account…" : "Create account"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
