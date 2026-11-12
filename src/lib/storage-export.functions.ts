import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXPORT_BUCKETS, safePath, authorizeExport } from "./storage-export/core";
const bucket = z.enum(EXPORT_BUCKETS);
export const listExportFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      bucket,
      prefix: z
        .string()
        .max(1024)
        .refine((p) => safePath(p, true)),
      offset: z.number().int().min(0).max(1000000),
    }),
  )
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("Vary", "Authorization");
    await authorizeExport(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.storage
      .from(data.bucket)
      .list(data.prefix, {
        limit: 100,
        offset: data.offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (result.error || !result.data)
      throw new Error("Não foi possível listar os arquivos. Tente novamente.");
    const folders: string[] = [],
      files: { path: string; id: string; updatedAt: string; size: number }[] = [];
    for (const item of result.data) {
      const path = data.prefix ? `${data.prefix}/${item.name}` : item.name;
      if (!safePath(path))
        throw new Error("Arquivo com caminho incompatível; exportação interrompida.");
      if (item.id === null && item.metadata === null) folders.push(path);
      else {
        const size = Number(item.metadata?.["size"]);
        if (!item.id || !item.updated_at || !Number.isSafeInteger(size) || size < 0)
          throw new Error("Metadados incompletos; exportação interrompida.");
        files.push({ path, id: item.id, updatedAt: item.updated_at, size });
      }
    }
    return { folders, files, nextOffset: result.data.length === 100 ? data.offset + 100 : null };
  });
export const signExportFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      bucket,
      path: z
        .string()
        .max(1024)
        .refine((p) => safePath(p)),
    }),
  )
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("Vary", "Authorization");
    await authorizeExport(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.storage.from(data.bucket).createSignedUrl(data.path, 60);
    if (result.error || !result.data?.signedUrl)
      throw new Error("Não foi possível autorizar o download.");
    return { url: result.data.signedUrl };
  });
