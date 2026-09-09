import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlatformBrand } from "@/lib/referral-admin.functions";
import { cn } from "@/lib/utils";
import defaultMark from "@/assets/manuta-mark.png";

export const PRODUCT_NAME = "Manuta CRM";
export const PRODUCT_TAGLINE = "Customer Operations Platform";

/** Resolves the platform logo, honouring the Platform Owner's brand override. */
export function usePlatformBrand() {
  const brandFn = useServerFn(getPlatformBrand);
  const { data } = useQuery({
    queryKey: ["platform-brand"],
    queryFn: () => brandFn({}),
    staleTime: 5 * 60 * 1000,
  });
  return { logoSrc: data?.logoUrl || defaultMark, brand: data ?? null };
}

/**
 * Product identity lockup. This is the Manuta CRM brand and is never replaced
 * by a tenant's own logo — workspace identity is rendered separately.
 */
export function ManutaBrand({
  size = "md",
  showTagline = true,
  className,
}: {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
}) {
  const { logoSrc } = usePlatformBrand();
  const mark = size === "lg" ? "size-11" : size === "sm" ? "size-7" : "size-9";
  const title = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";

  return (
    <div className={cn("flex items-center gap-3 min-w-0", className)}>
      <img
        src={logoSrc}
        alt="Manuta CRM"
        width={512}
        height={512}
        className={cn(mark, "shrink-0 object-contain")}
      />
      <div className="min-w-0">
        <div className={cn("display-title leading-none truncate", title)}>
          MANUTA<span className="text-brand">·</span>CRM
        </div>
        {showTagline && (
          <div className="eyebrow mt-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
            {PRODUCT_TAGLINE}
          </div>
        )}
      </div>
    </div>
  );
}
