import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ProductSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(120).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  price: z.number().finite().min(0),
  stock_quantity: z.number().int().min(0),
  low_stock_threshold: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

const SyncSchema = z.object({ products: z.array(ProductSchema).min(1).max(500) });

export const Route = createFileRoute("/api/public/products/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey = request.headers.get("x-company-api-key") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (!providedKey || providedKey.length > 300) return Response.json({ error: "Invalid company API key" }, { status: 401 });

        let body: unknown;
        try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        const parsed = SyncSchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: "Invalid product payload", issues: parsed.error.issues.slice(0, 10) }, { status: 422 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: company, error: companyError } = await supabaseAdmin.from("companies").select("id").eq("api_key", providedKey).maybeSingle();
        if (companyError) return Response.json({ error: "Company lookup failed" }, { status: 500 });
        if (!company) return Response.json({ error: "Invalid company API key" }, { status: 401 });

        const rows = parsed.data.products.map((product) => ({
          ...product,
          company_id: company.id,
          sku: product.sku || null,
          category: product.category || null,
          low_stock_threshold: product.low_stock_threshold ?? 10,
        }));
        const { error } = await supabaseAdmin.from("products").upsert(rows, { onConflict: "company_id,sku" });
        if (error) return Response.json({ error: "Product sync failed" }, { status: 500 });
        return Response.json({ ok: true, synced: rows.length });
      },
    },
  },
});
