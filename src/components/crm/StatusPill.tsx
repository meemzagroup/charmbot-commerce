import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pill = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        brand: "bg-brand/15 text-brand",
        teal: "bg-teal/15 text-teal",
        neutral: "bg-foreground/10 text-foreground",
        muted: "bg-panel2 text-muted-foreground",
        danger: "bg-destructive/15 text-destructive",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export type PillTone = NonNullable<VariantProps<typeof pill>["tone"]>;

const ORDER_TONES: Record<string, PillTone> = {
  Pending: "brand",
  Processing: "teal",
  Shipped: "brand",
  Delivered: "neutral",
  Cancelled: "danger",
  Returned: "danger",
};

const PAYMENT_TONES: Record<string, PillTone> = {
  Paid: "teal",
  Pending: "brand",
  Refunded: "danger",
  COD: "muted",
};

const TAG_TONES: Record<string, PillTone> = {
  VIP: "brand",
  Repeat: "teal",
  New: "neutral",
  "At Risk": "danger",
};

const INQUIRY_TONES: Record<string, PillTone> = {
  Open: "brand",
  "In Progress": "teal",
  Resolved: "neutral",
  Closed: "muted",
};

export function StatusPill({
  value,
  kind = "order",
  className,
}: {
  value: string | null | undefined;
  kind?: "order" | "payment" | "tag" | "inquiry";
  className?: string;
}) {
  const label = value ?? "—";
  const map =
    kind === "payment"
      ? PAYMENT_TONES
      : kind === "tag"
        ? TAG_TONES
        : kind === "inquiry"
          ? INQUIRY_TONES
          : ORDER_TONES;
  return <span className={cn(pill({ tone: map[label] ?? "muted" }), className)}>{label}</span>;
}
