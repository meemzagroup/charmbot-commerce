import { createFileRoute } from "@tanstack/react-router";
import { AccountRecoveryAdmin } from "@/components/crm/AccountRecoveryAdmin";

export const Route = createFileRoute("/_authenticated/account-recovery")({
  head: () => ({
    meta: [
      { title: "Account Recovery · Meemza CRM" },
      {
        name: "description",
        content:
          "Administrator tools to recover Meemza CRM accounts: look up login IDs, send password resets, unlock accounts and review the security audit log.",
      },
      { property: "og:title", content: "Account Recovery · Meemza CRM" },
      {
        property: "og:description",
        content: "Look up login IDs, send password resets and unlock team accounts securely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountRecoveryAdmin,
});
