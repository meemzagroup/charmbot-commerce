import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in · Meemza CRM" },
      {
        name: "description",
        content:
          "Sign in to the Meemza Chemicals e-commerce CRM to manage orders, customers, inventory and AI support inquiries.",
      },
      { property: "og:title", content: "Sign in · Meemza CRM" },
      {
        property: "og:description",
        content: "Secure access to the Meemza Chemicals e-commerce CRM dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
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
            Orders, customers and AI support in one console
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
          <h2 className="display-title text-2xl">Sign in</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Access the Meemza operations dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@meemza.pk"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
            Continue with Google
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-6 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "signin"
              ? "No account? Create one"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
