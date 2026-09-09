import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { completePasswordReset, getMyPasswordState } from "@/lib/account-recovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password  | Manuta CRM" },
      {
        name: "description",
        content:
          "Create a new password for your Manuta CRM account using a single-use, expiring recovery link.",
      },
      { property: "og:title", content: "Set a new password  | Manuta CRM" },
      {
        property: "og:description",
        content: "Securely choose a new Manuta CRM password from your recovery link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const complete = useServerFn(completePasswordReset);
  const passwordState = useServerFn(getMyPasswordState);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [forced, setForced] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(Boolean(data.session));
      setReady(true);
      if (data.session) {
        try {
          const state = await passwordState({});
          if (!cancelled) setForced(Boolean(state.mustReset));
        } catch {
          /* recovery links have no profile state to read */
        }
      }
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(Boolean(session));
      setReady(true);
    });
    void check();
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [passwordState]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Both passwords must match");
      return;
    }
    setSaving(true);
    try {
      let { error } = await supabase.auth.updateUser(
        forced && current
          ? ({ password, current_password: current } as never)
          : ({ password } as never),
      );
      if (error && /current password/i.test(error.message) && current) {
        ({ error } = await supabase.auth.updateUser({ password, current_password: current } as never));
      }
      if (error) throw error;
      await complete({});
      await supabase.auth.signOut();
      toast.success("Password updated. Please sign in with your new password.");
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="display-title text-2xl leading-none">
          MEEMZA<span className="text-brand">·</span>CRM
        </div>
        <h1 className="display-title text-2xl mt-6 flex items-center gap-2">
          <ShieldCheck className="size-5 text-teal" /> Set a new password
        </h1>

        {ready && !hasSession ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              This recovery link is invalid, already used, or has expired. Recovery links work only
              once. Please request a new one from the sign-in page.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {forced && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  This is your first sign-in. Please replace the temporary password before
                  continuing — it stops working once you do.
                </p>
                <Label htmlFor="current_password">Temporary password</Label>
                <Input
                  id="current_password"
                  type={show ? "text" : "password"}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new_password">New password</Label>
              <div className="relative">
                <Input
                  id="new_password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input
                id="confirm_password"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
