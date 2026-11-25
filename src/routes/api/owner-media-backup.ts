import { createFileRoute } from "@tanstack/react-router";
import { Zip, ZipPassThrough } from "fflate";

// TEMPORARY owner-only export of the private "whatsapp-media" bucket.
// Remove after the owner confirms the backup has been verified.
const BUCKET = "whatsapp-media";

async function listAll(admin: any, prefix = ""): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const it of data) {
      const p = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) out.push(...(await listAll(admin, p)));
      else out.push({ path: p, size: Number(it.metadata?.size ?? 0) });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export const Route = createFileRoute("/api/owner-media-backup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: u } = await supabaseAdmin.auth.getUser(token);
        if (!u?.user) return new Response("Unauthorized", { status: 401 });
        const { data: prof } = await supabaseAdmin.from("profiles").select("is_super_admin").eq("id", u.user.id).maybeSingle();
        if (!prof?.is_super_admin) return new Response("Forbidden", { status: 403 });

        const files = await listAll(supabaseAdmin);
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const zip = new Zip((err, chunk, final) => {
              if (err) return controller.error(err);
              controller.enqueue(chunk);
              if (final) controller.close();
            });
            const lines = ["path,size_bytes,sha256,status"];
            let ok = 0;
            const fetchOne = async (f: { path: string; size: number }) => {
              for (let i = 0; i < 3; i++) {
                const { data } = await supabaseAdmin.storage.from(BUCKET).download(f.path);
                if (data) return await data.arrayBuffer();
              }
              return null;
            };
            const W = 12;
            const pending: Promise<ArrayBuffer | null>[] = files.slice(0, W).map(fetchOne);
            for (let i = 0; i < files.length; i++) {
              const f = files[i]!;
              const buf = await pending[i]!;
              if (i + W < files.length) pending.push(fetchOne(files[i + W]!));
              pending[i] = Promise.resolve(null);
              const q = `"${f.path.replace(/"/g, '""')}"`;
              if (!buf) { lines.push(`${q},${f.size},,MISSING`); continue; }
              const entry = new ZipPassThrough(f.path);
              zip.add(entry);
              entry.push(new Uint8Array(buf), true);
              lines.push(`${q},${buf.byteLength},${hex(await crypto.subtle.digest("SHA-256", buf))},OK`);
              ok++;
            }
            lines.push(`# listed=${files.length} exported=${ok} missing=${files.length - ok}`);
            const m = new ZipPassThrough("_backup_manifest.csv");
            zip.add(m);
            m.push(new TextEncoder().encode(lines.join("\n") + "\n"), true);
            zip.end();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="whatsapp-media-backup.zip"`,
            "Cache-Control": "no-store",
            "X-Backup-File-Count": String(files.length),
          },
        });
      },
    },
  },
});
