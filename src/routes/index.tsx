import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

// The Cormyr Web site is the original static HTML/JS app, kept intact in public/cormyr/.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cormyr Web — Crônicas do Reino" },
      { name: "description", content: "Cormyr Web: casas nobres, hierarquias, aventuras e 200 eventos para narrar a campanha em Cormyr." },
      { property: "og:title", content: "Cormyr Web — Crônicas do Reino" },
      { property: "og:description", content: "Casas nobres, hierarquias, aventuras e eventos da campanha em Cormyr." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace("/cormyr/index.html" + window.location.hash);
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <a href="/cormyr/index.html">Abrindo Cormyr Web…</a>
    </div>
  );
}
