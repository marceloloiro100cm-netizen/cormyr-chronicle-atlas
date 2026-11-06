import { createFileRoute } from "@tanstack/react-router";
import {resolvePublicSupabase} from '@/integrations/supabase/public-config';

// GM material lives in Supabase behind an admin-only RLS policy.
// No event, adventure or secret is bundled into the public repository.
export const Route = createFileRoute("/api/public/gm-content")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const fail = (status: number) =>
          new Response(JSON.stringify({ error: status === 503 ? "unavailable" : "forbidden" }), {
            status,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        const auth = request.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return fail(401);

        const {url:sourceUrl,key}=resolvePublicSupabase(process.env['SUPABASE_URL'],
          process.env['SUPABASE_PUBLISHABLE_KEY']);
        const url=sourceUrl.replace(/\/+$/,'');
        if (!url || !key) return fail(503);
        const headers = {
          apikey: key,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        };
        try {
          const authResult = await fetch(`${url}/rest/v1/rpc/is_campaign_admin`, {
            method: "POST", headers, body: "{}", cache: "no-store",
          });
          if (!authResult.ok) return fail(401);
          if ((await authResult.json()) !== true) return fail(403);

          const dataResult = await fetch(
            `${url}/rest/v1/campaign_private_gm_content?select=payload&id=eq.atlas`,
            { headers, cache: "no-store" },
          );
          if (!dataResult.ok) return fail(503);
          const rows = (await dataResult.json()) as Array<{ payload?: unknown }>;
          if (!Array.isArray(rows) || !rows[0]?.payload) return fail(503);
          return new Response(JSON.stringify(rows[0].payload), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "private, no-store",
              "Vary": "Authorization",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return fail(503);
        }
      },
    },
  },
});
