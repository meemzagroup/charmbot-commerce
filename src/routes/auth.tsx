import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ForgotLoginIdDialog, ForgotPasswordDialog } from "@/components/crm/RecoveryDialogs";
import { ManutaBrand } from "@/components/brand/ManutaBrand";


export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | Manuta CRM" },
      {
        name: "description",
        content:
          "Sign in to the your company e-commerce CRM to manage orders, customers, inventory and AI support inquiries.",
      },
      { property: "og:title", content: "Sign in | Manuta CRM" },
      {
        property: "og:description",
        content: "Secure access to the your company e-commerce CRM dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const REMEMBER_KEY = "meemza.remembered_login_id";

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) {
    return "That email or password is not correct. Check them and try again.";
  }
  if (m.includes("banned") || m.includes("disabled") || m.includes("suspend")) {
    return "This account is suspended. Please contact your company administrator.";
  }
  if (m.includes("email not confirmed")) {
    return "This account is not activated yet. Please contact your company administrator.";
  }
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  return message;
}

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [forgotLoginId, setForgotLoginId] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (remember) window.localStorage.setItem(REMEMBER_KEY, email);
      else window.localStorage.removeItem(REMEMBER_KEY);

      const { data: profile } = await supabase
        .from("profiles")
        .select("status, must_reset_password")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profile?.status === "Inactive") {
        await supabase.auth.signOut();
        setFormError(
          "This account is deactivated. Please contact your company administrator to restore access.",
        );
        return;
      }
      if (profile?.must_reset_password) {
        toast.info("Your administrator asked you to set a new password before continuing.");
        navigate({ to: "/reset-password" });
        return;
      }
      navigate({ to: "/" });
    } catch (error) {
      const message = friendlyAuthError(
        error instanceof Error ? error.message : "Authentication failed",
      );
      setFormError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }



  return (
    <div className="min-h-screen bg-ink grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between border-r border-line bg-panel p-12">
        <div>
          <div className="display-title text-2xl leading-none">
            MEEMZA<span className="text-brand">·</span>CRM
          </div>
          <div className="eyebrow mt-2">E-commerce Command</div>
        </div>
        <div className="space-y-4 max-w-sm">
          <h1 className="display-title text-4xl leading-tight">
            Run your entire business from one command centre
          </h1>
          <p className="text-sm text-muted-foreground">
            Live fulfilment tracking, inventory alerts, customer lifetime value and an AI assistant
            that answers order questions and captures leads around the clock.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-teal live-dot" /> Systems operational
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <ManutaBrand />
          </div>
          <h2 className="display-title text-2xl">Sign in</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Access your Manuta CRM workspace.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label htmlFor="remember" className="flex items-center gap-2 text-muted-foreground">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-4 rounded border-line bg-panel2 accent-[var(--brand)]"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => setForgotPassword(true)}
                className="text-teal hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : "Sign in"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setForgotLoginId(true)}
            className="mt-4 w-full text-center text-xs text-teal hover:underline"
          >
            Forgot login ID / email?
          </button>

          <p className="mt-6 text-xs text-muted-foreground text-center">
            Accounts are created by the Super Admin only. Contact your administrator for access.
          </p>

          <ForgotPasswordDialog
            open={forgotPassword}
            onOpenChange={setForgotPassword}
            defaultEmail={email}
          />
          <ForgotLoginIdDialog open={forgotLoginId} onOpenChange={setForgotLoginId} />
        </div>

      </div>
    </div>
  );
}
