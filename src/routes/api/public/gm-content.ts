import { createFileRoute } from "@tanstack/react-router";

// Narrator-only material (Eventos e Aventuras). Public path, so the handler
// itself verifies the bearer token and the admin role before returning data.
export const Route = createFileRoute("/api/public/gm-content")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const deny = (status: number) =>
          new Response(JSON.stringify({ error: "forbidden" }), {
            status,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        const auth = request.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return deny(401);
        const url = process.env.SUPABASE_URL!.replace(/\/+$/, "");
        const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const res = await fetch(`${url}/rest/v1/rpc/is_campaign_admin`, {
          method: "POST",
          headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) return deny(401);
        if ((await res.json()) !== true) return deny(403);
        const content = (await import("@/server/gm-content.json")).default;
        return new Response(JSON.stringify(content), {
          headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
        });
      },
    },
  },
});
