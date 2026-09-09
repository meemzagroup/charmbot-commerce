import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { ManutaBrand } from "@/components/brand/ManutaBrand";
import { trackReferralVisit } from "@/lib/invites.functions";

export const Route = createFileRoute("/r/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "You've been invited to Manuta CRM" },
      {
        name: "description",
        content:
          "Manuta CRM brings customers, sales, orders and business conversations together in one secure workspace. Explore the platform through a colleague's invitation.",
      },
      { property: "og:title", content: "You've been invited to Manuta CRM" },
      {
        property: "og:description",
        content: "Customers, sales, orders and conversations in one secure business workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReferralLanding,
});

function ReferralLanding() {
  const { code } = Route.useParams();
  const trackFn = useServerFn(trackReferralVisit);

  useEffect(() => {
    const key = `manuta.referral.${code}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    window.localStorage.setItem("manuta.referral_code", code);
    trackFn({ data: { code } }).catch(() => undefined);
  }, [code, trackFn]);

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-6">
      <div className="w-full max-w-lg text-center">
        <div className="flex justify-center">
          <ManutaBrand size="lg" />
        </div>
        <h1 className="display-title text-3xl mt-8">Someone thinks you&apos;d like Manuta CRM.</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Manuta CRM keeps customers, sales, orders, inventory and every business conversation in
          one secure workspace — built for teams that want to move faster together.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Workspaces are created by the Manuta CRM team. Contact us to start yours.
        </p>
      </div>
    </div>
  );
}
