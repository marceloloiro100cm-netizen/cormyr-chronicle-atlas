// Configuração Vite própria (antes: @lovable.dev/vite-tanstack-config).
// Ordem dos plugins: TanStack Start, React, Tailwind, aliases do tsconfig e Nitro.
// O alvo do Nitro é Node (node-server), usado pelo Firebase App Hosting / Cloud Run.
// Se necessário, force com NITRO_PRESET=node-server no ambiente de build.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    // Redireciona a entrada de servidor do TanStack Start para src/server.ts
    // (nosso wrapper de erros de SSR); o Nitro empacota a partir dela.
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
    tailwindcss(),
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Saída em dist/ (padrão exigido pela publicação Lovable); o Firebase
    // App Hosting aponta para dist/server/index.mjs em apphosting.yaml.
    // firebase-admin não funciona empacotado pelo Rolldown (erro
    // "reading 'SDK_VERSION'" em produção): é rastreado e copiado para
    // dist/server/node_modules, carregado em runtime como pacote Node.
    nitro({
      output: { dir: "dist" },
      traceDeps: ["firebase-admin"],
      routeRules: {
        "/cormyr/assets/**": {
          headers: {
            "cache-control":
              "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
          },
        },
        "/cormyr/casas/**": {
          headers: {
            "cache-control":
              "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
          },
        },
        "/cormyr/index.html": {
          headers: {
            "cache-control":
              "public, max-age=300, s-maxage=600, stale-while-revalidate=300",
          },
        },
        "/cormyr/**": {
          headers: {
            "cache-control":
              "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600",
          },
        },
      },
    }),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-start",
      "@tanstack/react-query",
    ],
  },
});
